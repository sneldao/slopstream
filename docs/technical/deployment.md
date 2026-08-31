# Demo Deployment Runbook

Slopstream's current hosted topology is a **demo environment**, not a
production money or identity deployment. It runs the API, verifier, generator,
and orchestrator as isolated Coolify applications on a private Docker network.

## Provision and deploy

From a checkout on the desired `main` revision:

```sh
scripts/provision-coolify.sh nuncio-vultr
```

The script creates or reconciles the `slopstream` Coolify project and its four
applications, updates runtime configuration, ensures generator asset storage,
and deploys services serially in dependency order:

1. verifier
2. generator
3. API
4. orchestrator gateway

It creates a unique short-lived Coolify API token for each run and removes that
token on exit. Provisioning changes application configuration and restarts the
demo services, so run it during a maintenance window. The in-memory API ledger
is intentionally reset by an API restart; it is not a persistent accounting
system.

## Network topology

| Service | Internal address | Public access |
| --- | --- | --- |
| API | `http://api:4000` | Gateway proxy only |
| Verifier | `http://verifier:4100` | Private |
| Generator | `http://generator:4300` | Demo asset port mapping |
| Orchestrator | `http://orchestrator:4200` | Gateway port mapping |

The orchestrator is the browser-facing gateway. It proxies REST commands and
snapshots to the private API, owns the WebSocket sequence space, permits the
`Idempotency-Key` CORS header, and forwards that header to the API.

## Optional operational alerts

The orchestrator can emit aggregate, transition-based operational alerts. Set
`ALERT_WEBHOOK_URL` only to a trusted receiver; the endpoint receives stream
health metadata, so keep it in Coolify secrets rather than source control. The
other runtime settings default to:

```text
ALERT_POLL_MS=5000
ALERT_WEBHOOK_TIMEOUT_MS=5000
ALERT_IDLE_THRESHOLD_MS=10000
```

`generation.at_risk` is a warning when generation may exhaust the ready queue;
`stream.idle` is critical only after sustained dead air. Deliveries use a JSON
object with `source`, `kind`, `severity`, `occurredAt`, `message`, and the
aggregate `StreamOpsMetrics` snapshot in `metrics`. Each incident is latched
after a successful delivery and resets after recovery. A non-2xx response,
network error, or timeout is logged and retried on the next metrics sample.
When no webhook is configured, alerts remain local warning logs.

This direct webhook is intentionally best-effort: it has no signed delivery,
durable queue, backoff store, or audit trail. It must never carry credentials
or listener-level data, and it must not be treated as the durable alert outbox
required before a money-bearing deployment. Restrict outbound network access
and configure receiver authentication at the destination.

## Security boundary

The current demo uses raw HTTP port mappings. It is suitable only for a trusted,
temporary demonstration with fictional balances and stub verifier/generator
modes. Do **not** expose brand or listener bearer credentials, real Stripe
keys, or real payout behavior through this topology.

Before any public or money-bearing deployment:

1. Configure a real domain and TLS termination in Coolify/Traefik; publish only
   `https://` and `wss://` browser endpoints.
2. Remove raw public port mappings or restrict them to trusted operators.
3. Replace in-memory ledger, replay protection, and rate limits with durable,
   shared storage.
4. Implement a durable payout/alert outbox and a real payment/identity model.
5. Validate a rolling deployment strategy before rotating inter-service secrets.

## Verification

After provisioning, check the public gateway and generator health endpoints
reported by the script, then inspect Coolify application health. Before
releasing source changes, run:

```sh
pnpm --filter @slopstream/shared build
pnpm --filter @slopstream/api typecheck
pnpm --filter @slopstream/web typecheck
pnpm --filter @slopstream/orchestrator typecheck
pnpm --filter @slopstream/api test -- --run
pnpm --filter @slopstream/web test -- --run
pnpm --filter @slopstream/orchestrator test -- --run
```
