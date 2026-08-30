import { Daytona } from "@daytona/sdk";
import type { GenerationRequest, GenerationResult } from "@slopstream/shared";

import {
  StubGenerationProvider,
  type GenerationProvider,
} from "./generator.js";

const DEFAULT_CREATE_TIMEOUT_SEC = 120;
const DEFAULT_EXECUTION_TIMEOUT_SEC = 300;
const DEFAULT_SANDBOX_TTL_MINUTES = 15;

export type GeneratorMode = "stub" | "daytona";

export interface DaytonaCommandResponse {
  exitCode: number;
  result: string;
}

export interface DaytonaSandboxLike {
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<DaytonaCommandResponse>;
  };
  delete(timeout?: number, wait?: boolean): Promise<void>;
}

export interface DaytonaClientLike {
  create(
    params: {
      language: "typescript";
      snapshot?: string;
      labels: Record<string, string>;
      envVars?: Record<string, string>;
      secrets?: Record<string, string>;
      ephemeral: true;
      ttlMinutes: number;
    },
    options: { timeout: number },
  ): Promise<DaytonaSandboxLike>;
}

export interface DaytonaGenerationProviderConfig {
  command: string;
  snapshot?: string;
  createTimeoutSec: number;
  executionTimeoutSec: number;
  sandboxTtlMinutes: number;
  commandEnvironment?: Record<string, string>;
  commandWorkingDirectory?: string;
  secretMappings?: Record<string, string>;
}

export interface DaytonaClientConfig {
  apiKey: string;
  apiUrl?: string;
  target?: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

type DaytonaCommandOutput = GenerationResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMetadata(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function parseCommandOutput(
  stdout: string,
  expectedSegmentId: string,
): DaytonaCommandOutput {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(
      "Daytona generation command must emit exactly one JSON GenerationResult",
    );
  }

  if (!isRecord(value)) {
    throw new Error("Daytona generation command returned a non-object result");
  }

  const {
    segmentId,
    assetUrl,
    durationSec,
    transcript,
    summary,
    visualMetadata,
    audioMetadata,
  } = value;

  if (
    segmentId !== expectedSegmentId ||
    !isNonEmptyString(assetUrl) ||
    typeof durationSec !== "number" ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    !isNonEmptyString(transcript) ||
    !isNonEmptyString(summary) ||
    (visualMetadata !== undefined && !isMetadata(visualMetadata)) ||
    (audioMetadata !== undefined && !isMetadata(audioMetadata))
  ) {
    throw new Error("Daytona generation command returned an invalid result");
  }

  return {
    segmentId,
    assetUrl,
    durationSec,
    transcript,
    summary,
    ...(visualMetadata === undefined ? {} : { visualMetadata }),
    ...(audioMetadata === undefined ? {} : { audioMetadata }),
  };
}

/**
 * Executes one trusted generation command in an isolated Daytona sandbox.
 *
 * The command receives the JSON-encoded GenerationRequest in the
 * SLOPSTREAM_GENERATION_REQUEST environment variable and must write exactly one
 * JSON GenerationResult to stdout. Its assetUrl must already point to durable
 * storage: sandbox download URLs stop working when this provider deletes the
 * disposable sandbox in finally.
 */
export class DaytonaGenerationProvider implements GenerationProvider {
  constructor(
    private readonly config: DaytonaGenerationProviderConfig,
    private readonly client: DaytonaClientLike,
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    let sandbox: DaytonaSandboxLike | undefined;
    let generationFailed = true;

    try {
      sandbox = await this.client.create(
        {
          language: "typescript",
          ...(this.config.snapshot === undefined
            ? {}
            : { snapshot: this.config.snapshot }),
          labels: {
            application: "slopstream-generator",
            segmentId: request.segmentId,
          },
          ...(this.config.commandEnvironment === undefined
            ? {}
            : { envVars: this.config.commandEnvironment }),
          ...(this.config.secretMappings === undefined
            ? {}
            : { secrets: this.config.secretMappings }),
          ephemeral: true,
          ttlMinutes: this.config.sandboxTtlMinutes,
        },
        { timeout: this.config.createTimeoutSec },
      );

      const execution = await sandbox.process.executeCommand(
        this.config.command,
        this.config.commandWorkingDirectory,
        { SLOPSTREAM_GENERATION_REQUEST: JSON.stringify(request) },
        this.config.executionTimeoutSec,
      );

      if (execution.exitCode !== 0) {
        throw new Error(
          `Daytona generation command failed with exit code ${execution.exitCode}`,
        );
      }

      const result = parseCommandOutput(execution.result, request.segmentId);
      generationFailed = false;
      return result;
    } finally {
      if (sandbox) {
        try {
          await sandbox.delete(this.config.createTimeoutSec, true);
        } catch (cleanupError) {
          if (!generationFailed) {
            throw cleanupError;
          }
        }
      }
    }
  }
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when GENERATOR_MODE=daytona`);
  }
  return value;
}

function optionalEnvironmentValue(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function positiveIntegerFromEnvironment(
  environment: Environment,
  name: string,
  fallback: number,
): number {
  const value = optionalEnvironmentValue(environment, name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function secretMappingsFromEnvironment(
  environment: Environment,
): Record<string, string> | undefined {
  const raw = optionalEnvironmentValue(environment, "DAYTONA_SECRET_MAPPINGS");
  if (raw === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DAYTONA_SECRET_MAPPINGS must be a JSON object");
  }

  if (
    !isRecord(parsed) ||
    !Object.entries(parsed).every(
      ([environmentName, secretName]) =>
        isNonEmptyString(environmentName) && isNonEmptyString(secretName),
    )
  ) {
    throw new Error(
      "DAYTONA_SECRET_MAPPINGS must map non-empty environment names to Daytona Secret names",
    );
  }

  return parsed as Record<string, string>;
}

function commandEnvironmentFromEnvironment(
  environment: Environment,
): Record<string, string> | undefined {
  const names = ["ASSET_UPLOAD_URL", "ELEVENLABS_VOICE_ID"] as const;
  const entries = names.flatMap((name) => {
    const value = optionalEnvironmentValue(environment, name);
    return value === undefined ? [] : [[name, value] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

export function configuredGeneratorMode(
  environment: Environment,
): GeneratorMode {
  const mode = environment.GENERATOR_MODE ?? "stub";
  if (mode === "stub" || mode === "daytona") {
    return mode;
  }
  throw new Error(
    `Unsupported GENERATOR_MODE=${mode}. Expected "stub" or "daytona".`,
  );
}

/**
 * Builds the selected provider without running a sandbox. Raw model/provider
 * keys are intentionally not copied into sandbox envVars; map Daytona-managed
 * organization Secrets with DAYTONA_SECRET_MAPPINGS instead.
 */
export function createGenerationProviderFromEnv(
  environment: Environment = process.env,
  createClient: (config: DaytonaClientConfig) => DaytonaClientLike = (config) =>
    new Daytona(config),
): GenerationProvider {
  if (configuredGeneratorMode(environment) === "stub") {
    return new StubGenerationProvider();
  }

  const clientConfig: DaytonaClientConfig = {
    apiKey: requiredEnvironmentValue(environment, "DAYTONA_API_KEY"),
    ...(optionalEnvironmentValue(environment, "DAYTONA_API_URL") === undefined
      ? {}
      : { apiUrl: optionalEnvironmentValue(environment, "DAYTONA_API_URL") }),
    ...(optionalEnvironmentValue(environment, "DAYTONA_TARGET") === undefined
      ? {}
      : { target: optionalEnvironmentValue(environment, "DAYTONA_TARGET") }),
  };

  const providerConfig: DaytonaGenerationProviderConfig = {
    command: requiredEnvironmentValue(environment, "DAYTONA_SCRIPT_COMMAND"),
    ...(optionalEnvironmentValue(environment, "DAYTONA_SNAPSHOT") === undefined
      ? {}
      : {
          snapshot: optionalEnvironmentValue(environment, "DAYTONA_SNAPSHOT"),
        }),
    createTimeoutSec: positiveIntegerFromEnvironment(
      environment,
      "DAYTONA_CREATE_TIMEOUT_SEC",
      DEFAULT_CREATE_TIMEOUT_SEC,
    ),
    executionTimeoutSec: positiveIntegerFromEnvironment(
      environment,
      "DAYTONA_EXECUTION_TIMEOUT_SEC",
      DEFAULT_EXECUTION_TIMEOUT_SEC,
    ),
    sandboxTtlMinutes: positiveIntegerFromEnvironment(
      environment,
      "DAYTONA_SANDBOX_TTL_MINUTES",
      DEFAULT_SANDBOX_TTL_MINUTES,
    ),
    ...(optionalEnvironmentValue(environment, "DAYTONA_COMMAND_WORKDIR") ===
    undefined
      ? {}
      : {
          commandWorkingDirectory: optionalEnvironmentValue(
            environment,
            "DAYTONA_COMMAND_WORKDIR",
          ),
        }),
    ...(commandEnvironmentFromEnvironment(environment) === undefined
      ? {}
      : { commandEnvironment: commandEnvironmentFromEnvironment(environment) }),
    ...(secretMappingsFromEnvironment(environment) === undefined
      ? {}
      : { secretMappings: secretMappingsFromEnvironment(environment) }),
  };

  return new DaytonaGenerationProvider(
    providerConfig,
    createClient(clientConfig),
  );
}
