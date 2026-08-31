# Midnight Verifier Deployment Guide

The attention-proof verifier runs as a standalone service (`apps/verifier`) in
one of two modes. The API (`apps/api`) always talks to it over HTTP with a
shared bearer token, regardless of mode.

```text
                  ┌─────────────┐
   POST /verify   │  verifier   │
  ◄──────────────►│  :4100      │
   bearer token   │             │
                  │  mode:      │
                  │  stub ──────┤── JSON structural checks only
                  │  midnight ──┤── structural checks + on-chain recording
                  └─────────────┘
```

## Mode 1 — Stub (hackathon default)

No cryptography, no chain. The verifier validates proof structure, binding
consistency, challenge timing, and nonce replay, then returns a deterministic
`stub_<sha256>` proof ID. This is the zero-config default.

```env
VERIFIER_MODE=stub
VERIFIER_API_TOKEN=slopstream-demo-verifier-token
```

## Mode 2 — Midnight (production)

After the same structural checks pass, the verifier submits the proof to the
deployed ProofOfAttention smart contract on the Midnight network. The on-chain
nullifier becomes the `proofId` (`midnight_<hex>`). A failed submission returns
`recording_failed`.

### Step-by-step deployment

**1. Deploy the ProofOfAttention contract.**

The contract source lives in `packages/midnight`. Use the Midnight CLI or SDK
to deploy it to your target network. Capture the deployed address.

```bash
# Example (Midnight CLI — adjust for your toolchain)
cd packages/midnight
pnpm build
# Deploy and record the address
```

**2. Generate a wallet seed.**

The Midnight wallet requires a 64-character hex seed. Generate one with a
cryptographically secure source:

```bash
openssl rand -hex 32
```

Store the output securely — it is not recoverable.

**3. Configure the verifier `.env`.**

```env
# apps/verifier/.env

VERIFIER_MODE=midnight
PORT=4100

# Deployed ProofOfAttention contract address
PROOF_OF_ATTENTION_CONTRACT_ADDRESS=0xYourDeployedAddress

# 64-hex wallet seed (keep secret, not recoverable)
MIDNIGHT_WALLET_SEED=abcdef0123456789...

# Encryption password for the LevelDB private-state store
MIDNIGHT_PRIVATE_STATE_PASSWORD=strong-random-password

# Shared bearer token — must match PROOF_VERIFIER_TOKEN in apps/api/.env
VERIFIER_API_TOKEN=production-strength-secret

# Production mode enforces token strength at startup
NODE_ENV=production
```

**4. Configure the API to talk to the verifier.**

```env
# apps/api/.env

PROOF_VERIFIER_MODE=remote
PROOF_VERIFIER_URL=http://verifier:4100/v1/attention-proofs/verify
PROOF_VERIFIER_TOKEN=production-strength-secret
```

The token must be identical in both `.env` files.

**5. Start the verifier.**

```bash
cd apps/verifier
pnpm build
node dist/index.js
```

On startup in midnight mode the verifier initializes the Midnight wallet
connection. If `MIDNIGHT_WALLET_SEED` is missing or malformed (not 64 hex
chars), the process exits immediately. If `NODE_ENV=production` and
`VERIFIER_API_TOKEN` is unset or equals the demo string, the process also
refuses to start.

### Environment variable reference

| Variable | Mode | Required | Description |
|---|---|---|---|
| `VERIFIER_MODE` | both | No (default `stub`) | `stub` or `midnight` |
| `PORT` | both | No (default `4100`) | HTTP listen port |
| `VERIFIER_API_TOKEN` | both | production | Shared bearer token for `/v1/attention-proofs/verify` |
| `NODE_ENV` | both | No | `production` enforces token strength |
| `PROOF_OF_ATTENTION_CONTRACT_ADDRESS` | midnight | Yes | Deployed contract address |
| `MIDNIGHT_WALLET_SEED` | midnight | Yes | 64 hex character wallet seed |
| `MIDNIGHT_PRIVATE_STATE_PASSWORD` | midnight | Yes | Encryption key for private-state LevelDB |

### Security notes

- Midnight mode submits real chain transactions per verified proof. The
  `VERIFIER_API_TOKEN` is mandatory in production — without it, anyone can
  trigger on-chain writes.
- The wallet seed and private-state password must be stored in a secrets
  manager, not committed to source control.
- The verifier's `/health` endpoint is unauthenticated and reports the active
  mode, which is safe for load balancer health checks.
- The API and verifier communicate over a private network (Docker internal or
  VPS loopback). Expose only the API port externally.

### Verification

After deployment, confirm the verifier is healthy and in the correct mode:

```bash
curl http://localhost:4100/health
# { "ok": true, "service": "slopstream-verifier", "verifierMode": "midnight" }
```

Submit a test proof through the API and check that the response includes
`verifierMode: "midnight"` and a `midnight_` prefixed `proofId`.
