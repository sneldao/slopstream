# Demo Deployment Runbook

Slopstream's current hosted topology is a **demo environment**, not a
production money or identity deployment. It runs the API, verifier, generator,
and orchestrator as isolated Coolify applications on a private Docker network.

## Provision and deploy

From a checkout on the desired `main` revision, provide a queryless public
HTTPS origin whose `/assets/` path routes to the generator's static assets:

```sh
SLOPSTREAM_ASSET_BASE_URL=https://assets.example.com/slopstream \
  scripts/provision-coolify.sh nuncio-vultr
```

The provisioner rejects a missing/non-HTTPS value, and the generator rejects
loopback, private, and `.local` hosts at startup. The TLS proxy or CDN must
actually route `${SLOPSTREAM_ASSET_BASE_URL}/assets/*` to the generator; the
provisioner bundles deterministic MP3/PNG fixtures for stub mode, but cannot
create a public DNS route or certificate on its own.

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

| Service      | Internal address           | Public access           |
| ------------ | -------------------------- | ----------------------- |
| API          | `http://api:4000`          | Gateway proxy only      |
| Verifier     | `http://verifier:4100`     | Private                 |
| Generator    | `http://generator:4300`    | Demo asset port mapping |
| Orchestrator | `http://orchestrator:4200` | Gateway port mapping    |

The orchestrator is the browser-facing gateway. It proxies REST commands and
snapshots to the private API, owns the WebSocket sequence space, permits the
`Idempotency-Key` CORS header, and forwards that header to the API.

## Cost-controlled continuous-stream launch plan

The first public media launch should improve durability and continuity without
adding a managed database, Redis, or observability bill. This is a **single-node
launch posture**, not high availability: it is appropriate only while traffic,
provider spend, and VPS capacity remain within explicit operating limits.

**Implementation status:** the explicit manifest and buffered client-playout
items below are implemented in this release. Durable R2 delivery, a persistent
SQLite/WAL job store, and production-grade playout metrics remain launch
prerequisites; this demo release does not claim to provide them.

### Included launch changes

1. **Explicit media manifests.** Every segment will carry distinct `audioUrl`,
   `visualUrl`, media type, duration, poster, captions, and checksum fields.
   Clients must not infer narration by replacing a visual asset's filename
   extension. Both `/` and `/listen` will play the declared audio track for
   every supported production tier.
2. **Buffered client playout.** The viewer warms manifest-declared audio and
   visual derivatives for the next two ready segments. Current audio waits for
   `canplay`, retries from a user gesture when autoplay is blocked, and seeks a
   late joiner to the server-issued start time; visual video uses its manifest
   poster and a branded placement remains visible until the asset is playable.
   Browser readiness is local UX only—it never gates ledger windows or
   settlement. The scheduler caps its playout and challenge window to the
   natural manifest duration, while an approved manifest-backed encore covers
   an unavailable queue without opening an economic window.
3. **Required public-launch work: durable media delivery.** MP3, PNG, poster,
   MP4, captions, and manifests must be written to the existing Cloudflare R2
   asset layer, not retained only on the generator filesystem. The current
   generator filesystem route is demo-only and not durable public delivery.
   Direct ElevenLabs mode and the demo stub both require an explicit queryless
   public HTTPS `ASSET_BASE_URL` served by a TLS proxy or CDN; they fail fast
   rather than issuing a manifest the API will reject. The Coolify provisioner
   requires that origin and ships deterministic MP3/PNG stub fixtures under
   `/assets/`, but an operator must configure DNS, TLS, and routing before
   deployment. Public asset responses must be cacheable; uploads remain
   authenticated. Asset lifecycle rules keep only replay-ready derivatives for
   the configured retention window and remove intermediates.
4. **Required public-launch work: single-node durable jobs.** A mounted
   SQLite/WAL database must persist segment, retry, idempotency, and
   worker-lease state on the Coolify host. One worker consumes due
   generation/playout jobs with bounded exponential retries and terminal
   dead-letter status. A daily encrypted database backup is copied to R2.
   This replaces in-memory-only recovery without introducing a second data
   service.
5. **Required public-launch work: cost and continuity controls.** Provider
   calls must be deduplicated by a durable request fingerprint; each tier
   needs daily generation limits and each brand needs a spend cap. When the
   playout-ready buffer is below target, the stream uses an approved encore
   or low-cost station/interstitial asset rather than speculative paid
   generation or dead air.
6. **Required public-launch work: playout observability.** A
   Prometheus-compatible `/metrics` endpoint and structured logs must expose
   ready-buffer seconds, generation latency, time-to-first-audio/frame, asset
   failures, retries, fallback frequency, and dead-air duration. Alert
   thresholds must use those aggregate measures only.

### Free-tier guardrails

- Launch with **audio** and **audio + image** as the default formats. Generated
  video/premium is disabled unless an operator grants a specific campaign and
  daily provider-credit budget.
- Keep media derivatives small and mobile-oriented, cache immutable assets, and
  apply retention before R2 storage or request allowances are exceeded.
- Do not proxy every asset read through custom application logic. Cache-friendly
  object delivery preserves Worker request headroom.
- Do not add PostgreSQL, Redis, a managed queue, or managed metrics while the
  existing VPS cannot demonstrate adequate CPU, memory, disk, and backup
  headroom under load.

### Scale-up gate

Move from the single-node SQLite worker to PostgreSQL plus Redis/BullMQ (or an
equivalent durable broker) only after a load test or live metrics show that the
VPS cannot meet the ready-buffer target, retry backlog, recovery-time, or
backup-restore objective. The media-manifest and job-store interfaces must make
that migration an implementation swap, not a client or auction-contract change.

The Cloudflare R2 and Workers free allowances, plus any AI-provider free-tier
limits, are capacity ceilings rather than launch guarantees. Review current
provider pricing, account eligibility, and usage dashboards before enabling
image or video generation at scale.

### Security and caching invariants

These rules apply to every public launch. They are release criteria, not
best-effort recommendations.

1. **Constrain the public surface.** Browsers reach only the TLS-protected
   gateway (`https://`/`wss://`) and public CDN asset URLs. The API, generator,
   verifier, uploader, database, worker, and inter-service control endpoints
   remain private. Each service, deployment environment, and upload caller has
   a separate least-privilege credential; no credential is embedded in browser
   code, an asset URL, or a manifest.
2. **Treat upload as an authenticated integrity boundary.** The uploader accepts
   only authenticated writes, approved object-key namespaces, configured size
   limits, expected media MIME types, and validated checksums. It rejects path
   traversal, ambiguous content types, and a completed upload whose bytes do
   not match the declared digest. Generator-local files and unvalidated
   provider URLs are never considered durable public media.
3. **Publish minimal, public manifests.** A manifest contains only token-free
   public media URLs, MIME types, byte digests, media type, duration, poster,
   and captions. URLs are HTTPS, have no query, fragment, or credentials, and
   must not act as bearer credentials. A manifest must not contain prompts,
   identities, listener state, uploader credentials, private provider metadata,
   or signed URLs that act as credentials. API and worker boundaries validate
   URL scheme, absence of URL credentials/query/fragments, MIME type, and
   lowercase SHA-256 digest before a segment becomes ready.
4. **Cache immutable bytes aggressively.** Published audio, image, video,
   poster, caption, and manifest-revision assets use content-addressed immutable
   paths and `Cache-Control: public, max-age=31536000, immutable`. A changed
   derivative receives a new path and digest; it never overwrites a previously
   public object. This supports client preloading without stale-media races.
5. **Keep mutable and sensitive reads out of shared caches.** Stream snapshots,
   the current-manifest pointer, WebSocket/live-event state, bids, wallets,
   attention proofs, listener sessions, payout state, and operational endpoints
   must not use a long shared cache. Snapshot and pointer responses use an ETag
   with `Cache-Control: no-cache` (or an equivalently short, revalidated policy);
   authenticated or financial responses use `Cache-Control: no-store`.
6. **Current readiness limitation.** This demo preloads manifest-declared
   media locally and waits for `canplay` before active-audio playback, but it
   has no server-published manifest pointer or revision protocol. Local
   readiness therefore cannot prove it is transitioning to the server's exact
   current revision. A public launch must add a short-revalidated manifest
   pointer and require the client to validate that revision before transition;
   on failure it continues the current item or uses an approved fallback and
   never infers a sibling asset URL from a filename extension.

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
