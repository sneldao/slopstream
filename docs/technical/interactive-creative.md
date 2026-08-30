# Premium Interactive Creative Plan

## Decision

Daytona is not part of Slopstream's normal audio, image or video path. Those
jobs call trusted generation APIs from a conventional queued worker and publish
the resulting asset.

Daytona becomes useful for a separate **premium interactive creative** format:
a generated, self-contained experience such as an HTML/canvas/WebGL microsite,
a playable visual, or a custom render pipeline. In that situation it provides
an isolation boundary for executable output and an ephemeral toolchain.

## Product shape

Interactive is a creative-format choice inside the existing premium price tier;
it is not a silent replacement for every premium bid. The brand must see its
longer preparation window, its fallback media creative, and the fact that the
experience will be presented in a constrained player.

The initial format is intentionally narrow:

- a 20–30 second, self-contained HTML/canvas experience;
- a poster image and a standard video fallback;
- no required listener interaction to continue the stream or earn a reward;
- a normal recall-based Earn Mode opportunity unless a later, privacy-reviewed
  interaction-proof design is introduced.

## Delivery path

```text
Premium bid + interactive selection
        → queued creative job
        → Daytona builds a static bundle in an ephemeral sandbox
        → output validation and policy checks
        → durable immutable manifest + entry URL + poster + fallback asset
        → segment.ready
        → sandboxed iframe inside the Continuum portal
        → timeout/failure: standard media fallback plays
```

Generation remains ahead of the playback boundary. The stream must never wait
for a sandbox: existing content continues while preparation runs.

## Contract changes required

The current `GenerationResult` and `Segment` model one `assetUrl` and infer
audio/image/video from it. Before shipping interactive work, add an explicit
creative manifest rather than overloading that field:

- `format`: `audio | image | video | interactive`;
- `entryUrl` for an interactive bundle, plus immutable version/hash;
- `posterUrl` and `fallbackAssetUrl`;
- duration, permitted capabilities, and an output-validation status;
- job provenance for operators: provider, sandbox ID, timings, retry count,
  and build/publish outcome. This is private operational data, never public
  stream state.

The public screen should use the manifest rather than file-extension detection.
The existing `assetUrl` remains a compatibility field until media-only clients
are migrated.

## Safety and reliability requirements

- Run generated or user-supplied code only in the sandbox, with least-privilege
  secrets and no production database/network credentials.
- Publish assets to durable storage before deleting the sandbox; a sandbox URL
  is never a playback URL.
- Validate the bundle before promotion: allowed file types, size/duration
  limits, locked dependencies, malware/policy scanning, and a captured poster.
- Render with a restrictive iframe `sandbox` attribute and Content Security
  Policy. No same-origin parent access, top-level navigation, or uncontrolled
  network requests.
- Enforce a timeout, memory/CPU budget, and a fallback media creative. A failed
  build must become `segment.failed` or a known fallback, never a stalled slot.
- Keep execution logs and manifests for operators; expose only neutral
  generation progress to viewers.

## Rollout gates

1. **Foundation:** keep direct-worker audio/image/video generation as default;
   confirm queue retries, durable uploads, and fallback handling.
2. **Sandbox proof:** use Daytona to build one trusted static HTML/canvas
   template; validate, publish, and delete the sandbox in an end-to-end test.
3. **Safe player:** add the manifest contract and a sandboxed iframe portal
   with poster/video fallback and reduced-motion behavior.
4. **Buyer control:** add explicit interactive selection, pricing, estimated
   preparation time, and creative preview to the premium flow.
5. **Broader tooling:** only then permit richer generated WebGL, creator
   templates, or custom rendering tools.

Do not use Daytona for routine scraping, direct model API calls, or any task
on the live playback critical path.
