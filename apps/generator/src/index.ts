export {
  createGenerationService,
  createStubGenerator,
  generate,
  InMemoryGenerationJobStore,
  StubGenerationProvider,
  type GenerationJobStore,
  type GenerationProvider,
} from "./generator.js";
export { createGeneratorServer, parseGenerationRequest } from "./server.js";

import { createGeneratorServer } from "./server.js";

const configuredMode = process.env.GENERATOR_MODE ?? "stub";

if (configuredMode !== "stub") {
  throw new Error(
    `Unsupported GENERATOR_MODE=${configuredMode}. Only "stub" is implemented; refusing to start an unimplemented generator.`,
  );
}

const port = Number(process.env.PORT ?? 4300);
const server = createGeneratorServer();

server.listen(port, () => {
  console.log(
    `slopstream generator listening on :${port} (${configuredMode} mode)`,
  );
});
