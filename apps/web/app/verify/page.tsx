"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SurfaceHeader } from "../_components/SurfaceHeader";
import { SphereField } from "../_components/SphereField";
import {
  contractStateQuery,
  isValidContractAddress,
  normalizeNullifier,
  readNullifierWindow,
} from "@/lib/verifyProof";

const CHUNK = "\n";

type VerifyStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "found"; stateSha256: string; nullifier: string }
  | { kind: "not-found"; stateSha256: string; nullifier: string }
  | { kind: "indexer-error"; message: string }
  | { kind: "awaiting-deploy" };

// Midnight's own hosted preprod indexer was decommissioned 2026-10-09
// (HTTP 410 ENDPOINT_DECOMMISSIONED). Blockfrost now serves the public
// indexer; every request needs a project token. For a browser page the
// documented pattern is ?project_id= in the URL — the token is meant to be
// public (same as any NEXT_PUBLIC_ value).
const BLOCKFROST_PROJECT_ID =
  process.env.NEXT_PUBLIC_BLOCKFROST_MIDNIGHT_PROJECT_ID ?? "";
const PREPROD_INDEXER =
  process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER ??
  `https://midnight-preprod.blockfrost.io/api/v0${BLOCKFROST_PROJECT_ID ? `?project_id=${BLOCKFROST_PROJECT_ID}` : ""}`;

async function canonSha(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function consoleSnippet(addr: string, nul: string): string {
  return [
    "// Paste in any browser console. Public indexer only.",
    "// 1. Copy ADDRESS and NULLIFIER below into your own fetch call.",
    "// 2. POST { contractState(address) { data } } to the preprod indexer.",
    "// 3. Check String(stateData).includes(NULLIFIER).",
    "ADDRESS: " + addr,
    "NULLIFIER: " + nul,
    "INDEXER: " + PREPROD_INDEXER,
  ].join(CHUNK);
}

function aiPrompt(addr: string, nul: string): string {
  return [
    "Verify this Midnight preprod claim without trusting Slopstream.",
    "Ask any AI: POST contractState(address) to INDEXER, search for NUL.",
    "ADDRESS: " + addr,
    "NULLIFIER: " + nul,
    "INDEXER: " + PREPROD_INDEXER,
  ].join(CHUNK);
}

function terminalLine(addr: string, nul: string): string {
  return [
    "# Terminal check: POST the GraphQL query, grep the nullifier.",
    "# Replace ADDR and NUL, then run:",
    "# curl -s -X POST INDEXER -H 'content-type: application/json' --data ... | grep NUL",
    "ADDR=" + addr,
    "NUL=" + nul,
  ].join(CHUNK);
}

export default function VerifyPage() {
  const [nullifierInput, setNullifierInput] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [status, setStatus] = useState<VerifyStatus>({ kind: "idle" });
  const [copied, setCopied] = useState<string | null>(null);

  // Deep-link from receipts: /verify?nullifier=midnight_<hex> pre-fills.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked =
      params.get("nullifier") ?? params.get("proofId") ?? params.get("proof");
    if (linked) setNullifierInput(linked);
  }, []);

  const normalized = useMemo(
    () => normalizeNullifier(nullifierInput),
    [nullifierInput],
  );

  const address = contractAddress.trim();
  const addressValid = isValidContractAddress(address);

  const check = useCallback(async () => {
    if (!address) {
      setStatus({ kind: "awaiting-deploy" });
      return;
    }
    if (!addressValid) {
      setStatus({
        kind: "indexer-error",
        message: 'Contract address is not a valid identifier. NOT "no record".',
      });
      return;
    }
    if (!normalized) return;
    setStatus({ kind: "checking" });
    try {
      const res = await fetch(PREPROD_INDEXER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: contractStateQuery(address),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        setStatus({
          kind: "indexer-error",
          message:
            res.status === 403 && !BLOCKFROST_PROJECT_ID
              ? 'Indexer needs a Blockfrost project token (NEXT_PUBLIC_BLOCKFROST_MIDNIGHT_PROJECT_ID unset). NOT "no record" — state unread.'
              : `Indexer HTTP ${res.status}. NOT "no record" — state unread.`,
        });
        return;
      }
      const outcome = readNullifierWindow(await res.json(), normalized);
      if (outcome.kind === "unread") {
        setStatus({
          kind: "indexer-error",
          message: "No contract state returned. NOT 'no record'.",
        });
        return;
      }
      const stateSha256 = await canonSha(outcome.stateData);
      setStatus(
        outcome.kind === "found"
          ? { kind: "found", stateSha256, nullifier: normalized }
          : { kind: "not-found", stateSha256, nullifier: normalized },
      );
    } catch (error) {
      setStatus({
        kind: "indexer-error",
        message:
          error instanceof Error
            ? `Unreachable (${error.message}). NOT "no record".`
            : "Network error. NOT 'no record'.",
      });
    }
  }, [address, addressValid, normalized]);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* selectable fallback */
    }
  }, []);

  const snippet =
    address && normalized ? consoleSnippet(address, normalized) : "";
  const oneLiner =
    address && normalized ? terminalLine(address, normalized) : "";
  const prompt = address && normalized ? aiPrompt(address, normalized) : "";

  const resultClass =
    status.kind === "found"
      ? "verify-result verify-result--found"
      : status.kind === "not-found"
        ? "verify-result verify-result--missing"
        : status.kind === "indexer-error" || status.kind === "awaiting-deploy"
          ? "verify-result verify-result--warn"
          : "verify-result";

  return (
    <main className="slop-surface-shell has-dock">
      <SphereField className="sphere-field--soft" />
      <div className="slop-grain" />

      <SurfaceHeader
        subtitle="Verify"
        tone="dark"
        trailing={
          <a className="slop-hud-pill" href="/">
            Back to the stream
          </a>
        }
      />

      <div className="verify-frame">
        <span className="slop-kicker" style={{ color: "var(--slop-violet)" }}>
          Independent verification
        </span>
        <h1 className="verify-title">Check a proof without trusting us</h1>
        <p className="verify-lede">
          Paste a Midnight nullifier from any receipt. This page reads public
          Midnight preprod state and searches the on-chain nullifier window —
          the same records any indexer query can return.
        </p>

        <div className="verify-field">
          <label className="verify-label" htmlFor="v-addr">
            Contract address
          </label>
          <input
            id="v-addr"
            className="verify-input"
            placeholder="from contracts/preprod/deployment.json"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            aria-invalid={address.length > 0 && !addressValid}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="verify-field">
          <label className="verify-label" htmlFor="v-nul">
            Proof id / nullifier
          </label>
          <input
            id="v-nul"
            className="verify-input"
            placeholder="midnight_…64 hex chars…"
            value={nullifierInput}
            onChange={(e) => setNullifierInput(e.target.value)}
            aria-invalid={nullifierInput.length > 0 && !normalized}
            autoComplete="off"
            spellCheck={false}
          />
          {nullifierInput.length > 0 && !normalized && (
            <p className="verify-hint">
              A nullifier is <code>midnight_</code> followed by 64 hex
              characters, exactly as printed on a proof receipt.
            </p>
          )}
        </div>

        <button
          type="button"
          className="verify-submit"
          onClick={() => void check()}
          disabled={!normalized}
        >
          Check on-chain state
        </button>

        <div className={resultClass} aria-live="polite">
          {status.kind === "idle" && (
            <span className="verify-hint">No check run yet.</span>
          )}
          {status.kind === "checking" && (
            <span className="verify-hint">Reading contract state…</span>
          )}
          {status.kind === "awaiting-deploy" && (
            <>
              <span className="verify-verdict">No address entered</span>
              <span className="verify-hint">
                The Wave 3 preprod deploy is pending — the address lands in
                <code> contracts/preprod/deployment.json</code>.
              </span>
            </>
          )}
          {status.kind === "found" && (
            <>
              <span className="verify-verdict">Nullifier found on-chain</span>
              <span className="verify-mono">state {status.stateSha256}</span>
              <span className="verify-mono">nullifier {status.nullifier}</span>
            </>
          )}
          {status.kind === "not-found" && (
            <>
              <span className="verify-verdict">No record found</span>
              <span className="verify-mono">state {status.stateSha256}</span>
              <span className="verify-hint">
                State <em>was</em> read and has no entry. Shown only after a
                successful read — never on indexer failure.
              </span>
            </>
          )}
          {status.kind === "indexer-error" && (
            <>
              <span className="verify-verdict">Indexer error</span>
              <span className="verify-mono">{status.message}</span>
            </>
          )}
        </div>

        {snippet && (
          <div className="verify-section">
            <h2 className="verify-heading">Do not trust this button</h2>
            <p className="verify-sub">
              The button runs our code. These run nothing of ours.
            </p>
            {(
              [
                ["console", "Console snippet", snippet],
                ["terminal", "Terminal one-liner", oneLiner],
                ["ai", "AI prompt", prompt],
              ] as const
            ).map(([key, title, text]) => (
              <div key={key} className="verify-snippet">
                <div className="verify-snippet__head">
                  <span>{title}</span>
                  <button
                    type="button"
                    className="verify-copy"
                    onClick={() => void copy(key, text)}
                  >
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="verify-pre">{text}</pre>
              </div>
            ))}
          </div>
        )}

        <div className="verify-section">
          <h2 className="verify-heading">Honest limits</h2>
          <ul className="verify-limits">
            <li>
              Midnight verified the ZK proof on acceptance; this page decodes.
            </li>
            <li>
              Backend ledger is authoritative for clearing in the hackathon.
            </li>
            <li>Reward weights are off-chain; the chain records claims.</li>
            <li>Not audited. Not mainnet.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
