export {
  createGenerationService,
  createStubGenerator,
  generate,
  InMemoryGenerationJobStore,
  StubGenerationProvider,
  type GenerationJobStore,
  type GenerationProvider,
} from "./generator.js";
export {
  configuredGeneratorMode,
  createGenerationProviderFromEnv,
  DaytonaGenerationProvider,
  type DaytonaClientLike,
  type DaytonaCommandResponse,
  type DaytonaGenerationProviderConfig,
  type DaytonaSandboxLike,
  type GeneratorMode,
} from "./daytonaProvider.js";
export {
  ElevenLabsGenerationProvider,
  createElevenLabsProviderFromEnv,
  type ElevenLabsProviderConfig,
} from "./elevenlabsProvider.js";
export { createGeneratorServer, parseGenerationRequest } from "./server.js";

import {
  configuredGeneratorMode,
  createGenerationProviderFromEnv,
} from "./daytonaProvider.js";
import { createGeneratorServer } from "./server.js";

const configuredMode = configuredGeneratorMode(process.env);
const provider = createGenerationProviderFromEnv(process.env);
const port = Number(process.env.PORT ?? 4300);
const configuredApiToken = process.env.GENERATOR_API_TOKEN?.trim();
const demoApiToken = "slopstream-demo-generator-token";
if (
  process.env.NODE_ENV === "production" &&
  (!configuredApiToken || configuredApiToken === demoApiToken)
) {
  throw new Error("GENERATOR_API_TOKEN must be set in production");
}
const server = createGeneratorServer({
  provider,
  generatorMode: configuredMode,
  apiToken: configuredApiToken ?? demoApiToken,
});

server.listen(port, () => {
  console.log(
    `slopstream generator listening on :${port} (${configuredMode} mode)`,
  );
});
