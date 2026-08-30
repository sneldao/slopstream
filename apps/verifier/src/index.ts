import { createVerifierServer } from "./server.js";

const configuredMode = process.env.VERIFIER_MODE ?? "stub";

if (configuredMode !== "stub") {
  throw new Error(
    `Unsupported VERIFIER_MODE=${configuredMode}. Only "stub" is implemented; refusing to mislabel a JSON verifier as Midnight.`,
  );
}

const port = Number(process.env.PORT ?? 4100);
const server = createVerifierServer();

server.listen(port, () => {
  console.log(
    `slopstream proof verifier listening on :${port} (${configuredMode} mode)`,
  );
});
