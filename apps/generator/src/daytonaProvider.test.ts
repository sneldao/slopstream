import { describe, expect, it, vi } from "vitest";

import {
  configuredGeneratorMode,
  createGenerationProviderFromEnv,
  DaytonaGenerationProvider,
  type DaytonaClientLike,
  type DaytonaSandboxLike,
} from "./daytonaProvider.js";
import { StubGenerationProvider } from "./generator.js";

const request = {
  segmentId: "segment:daytona",
  brandId: "brand:daytona",
  brief: "Introduce a durable media generation pipeline.",
  tier: "video" as const,
  previousSummaries: ["The launch starts quietly."],
};

const commandOutput = {
  segmentId: request.segmentId,
  assetUrl: "https://assets.example.test/segment-daytona.mp4",
  durationSec: 24,
  transcript: "A durable media generation pipeline is ready.",
  summary: "The pipeline has launched.",
  visualMetadata: { format: "mp4" },
  audioMetadata: { voice: "synthetic" },
};

function sandboxWith(
  result: string = JSON.stringify(commandOutput),
  exitCode = 0,
): DaytonaSandboxLike {
  return {
    process: {
      executeCommand: vi.fn().mockResolvedValue({ exitCode, result }),
    },
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function clientWith(sandbox: DaytonaSandboxLike): DaytonaClientLike {
  return { create: vi.fn().mockResolvedValue(sandbox) };
}

const providerConfig = {
  command: "pnpm run generate-segment",
  snapshot: "slopstream-media",
  createTimeoutSec: 41,
  executionTimeoutSec: 95,
  sandboxTtlMinutes: 12,
  commandWorkingDirectory: "/workspace/slopstream/apps/generator",
  commandEnvironment: {
    ASSET_UPLOAD_URL: "https://asset-uploader.example.test",
    ELEVENLABS_VOICE_ID: "voice-test",
  },
  secretMappings: { ASSET_TOKEN: "slopstream-asset-token" },
};

describe("DaytonaGenerationProvider", () => {
  it("executes the trusted command in a disposable sandbox and returns its durable result", async () => {
    const sandbox = sandboxWith();
    const client = clientWith(sandbox);
    const provider = new DaytonaGenerationProvider(providerConfig, client);

    await expect(provider.generate(request)).resolves.toEqual(commandOutput);

    expect(client.create).toHaveBeenCalledWith(
      {
        language: "typescript",
        snapshot: "slopstream-media",
        labels: {
          application: "slopstream-generator",
          segmentId: request.segmentId,
        },
        envVars: {
          ASSET_UPLOAD_URL: "https://asset-uploader.example.test",
          ELEVENLABS_VOICE_ID: "voice-test",
        },
        secrets: { ASSET_TOKEN: "slopstream-asset-token" },
        ephemeral: true,
        ttlMinutes: 12,
      },
      { timeout: 41 },
    );
    expect(sandbox.process.executeCommand).toHaveBeenCalledWith(
      "pnpm run generate-segment",
      "/workspace/slopstream/apps/generator",
      { SLOPSTREAM_GENERATION_REQUEST: JSON.stringify(request) },
      95,
    );
    expect(sandbox.delete).toHaveBeenCalledWith(41, true);
  });

  it("deletes the sandbox when command execution fails without masking that failure", async () => {
    const sandbox = sandboxWith("generation failed", 1);
    const deleteFailure = new Error("sandbox cleanup failed");
    sandbox.delete = vi.fn().mockRejectedValue(deleteFailure);
    const provider = new DaytonaGenerationProvider(
      providerConfig,
      clientWith(sandbox),
    );

    await expect(provider.generate(request)).rejects.toThrow(
      "Daytona generation command failed with exit code 1",
    );
    expect(sandbox.delete).toHaveBeenCalledWith(41, true);
  });

  it("rejects malformed or mismatched command output after cleanup", async () => {
    const sandbox = sandboxWith(
      JSON.stringify({
        ...commandOutput,
        segmentId: "segment:not-the-request",
      }),
    );
    const provider = new DaytonaGenerationProvider(
      providerConfig,
      clientWith(sandbox),
    );

    await expect(provider.generate(request)).rejects.toThrow(
      "Daytona generation command returned an invalid result",
    );
    expect(sandbox.delete).toHaveBeenCalledWith(41, true);
  });

  it("surfaces a cleanup failure after otherwise successful generation", async () => {
    const sandbox = sandboxWith();
    sandbox.delete = vi
      .fn()
      .mockRejectedValue(new Error("cleanup unavailable"));
    const provider = new DaytonaGenerationProvider(
      providerConfig,
      clientWith(sandbox),
    );

    await expect(provider.generate(request)).rejects.toThrow(
      "cleanup unavailable",
    );
  });
});

describe("Daytona configuration", () => {
  it("keeps stub mode as the default without constructing a Daytona client", () => {
    const clientFactory = vi.fn();

    const provider = createGenerationProviderFromEnv({}, clientFactory);

    expect(configuredGeneratorMode({})).toBe("stub");
    expect(provider).toBeInstanceOf(StubGenerationProvider);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("fails before creating a client when Daytona configuration is incomplete", () => {
    const clientFactory = vi.fn();

    expect(() =>
      createGenerationProviderFromEnv(
        { GENERATOR_MODE: "daytona", DAYTONA_SCRIPT_COMMAND: "generate" },
        clientFactory,
      ),
    ).toThrow("DAYTONA_API_KEY is required");
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("builds Daytona configuration and passes non-secret command settings to a sandbox", async () => {
    const sandbox = sandboxWith();
    const client = clientWith(sandbox);
    const clientFactory = vi.fn().mockReturnValue(client);

    const provider = createGenerationProviderFromEnv(
      {
        GENERATOR_MODE: "daytona",
        DAYTONA_API_KEY: "test-key",
        DAYTONA_API_URL: "https://daytona.example.test/api",
        DAYTONA_TARGET: "us-east",
        DAYTONA_SCRIPT_COMMAND: "pnpm run generate-segment",
        DAYTONA_COMMAND_WORKDIR: "/workspace/slopstream/apps/generator",
        ASSET_UPLOAD_URL: "https://asset-uploader.example.test",
        ELEVENLABS_VOICE_ID: "voice-test",
        DAYTONA_SECRET_MAPPINGS: '{"ASSET_TOKEN":"slopstream-asset-token"}',
      },
      clientFactory,
    );

    expect(provider).toBeInstanceOf(DaytonaGenerationProvider);
    expect(clientFactory).toHaveBeenCalledWith({
      apiKey: "test-key",
      apiUrl: "https://daytona.example.test/api",
      target: "us-east",
    });

    await expect(provider.generate(request)).resolves.toEqual(commandOutput);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: {
          ASSET_UPLOAD_URL: "https://asset-uploader.example.test",
          ELEVENLABS_VOICE_ID: "voice-test",
        },
      }),
      expect.anything(),
    );
    expect(sandbox.process.executeCommand).toHaveBeenCalledWith(
      "pnpm run generate-segment",
      "/workspace/slopstream/apps/generator",
      { SLOPSTREAM_GENERATION_REQUEST: JSON.stringify(request) },
      300,
    );
  });
});
