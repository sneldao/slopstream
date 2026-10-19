"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const normalized = useMemo(() => {
    const n = nullifierInput
      .trim()
      .toLowerCase()
      .replace(/^midnight_/, "")
      .replace(/^0x/, "");
    return /^[0-9a-f]{64}$/.test(n) ? n : null;
  }, [nullifierInput]);

  const check = useCallback(async () => {
    if (!contractAddress.trim()) {
      setStatus({ kind: "awaiting-deploy" });
      return;
    }
    if (!normalized) return;
    setStatus({ kind: "checking" });
    try {
      const res = await fetch(PREPROD_INDEXER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: `{ contractState(address: "${contractAddress.trim()}") { data } }`,
        }),
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
      const body = (await res.json()) as {
        data?: { contractState?: { data?: string } };
      };
      const stateData = body?.data?.contractState?.data;
      if (typeof stateData !== "string") {
        setStatus({
          kind: "indexer-error",
          message: "No contract state returned. NOT 'no record'.",
        });
        return;
      }
      const stateSha256 = await canonSha(stateData);
      if (stateData.includes(normalized)) {
        setStatus({ kind: "found", stateSha256, nullifier: normalized });
      } else {
        setStatus({ kind: "not-found", stateSha256, nullifier: normalized });
      }
    } catch (error) {
      setStatus({
        kind: "indexer-error",
        message:
          error instanceof Error
            ? `Unreachable (${error.message}). NOT "no record".`
            : "Network error. NOT 'no record'.",
      });
    }
  }, [contractAddress, normalized]);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* selectable fallback */
    }
  }, []);

  const addr = contractAddress.trim();
  const snippet = addr && normalized ? consoleSnippet(addr, normalized) : "";
  const oneLiner = addr && normalized ? terminalLine(addr, normalized) : "";
  const prompt = addr && normalized ? aiPrompt(addr, normalized) : "";
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.kicker}>SLOPSTREAM · INDEPENDENT VERIFICATION</div>
        <h1 style={styles.title}>Verify an attention proof</h1>
        <p style={styles.lede}>
          Paste a midnight nullifier from any receipt. This page reads public
          Midnight preprod state and searches the on-chain nullifier window.
        </p>
        <label style={styles.label} htmlFor="v-addr">
          Contract address (contracts/preprod/deployment.json)
        </label>
        <input
          id="v-addr"
          style={styles.input}
          placeholder="empty = awaiting Wave 3 deploy"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <label style={styles.label} htmlFor="v-nul">
          Proof id / nullifier
        </label>
        <input
          id="v-nul"
          style={styles.input}
          placeholder="midnight_<64 hex chars>"
          value={nullifierInput}
          onChange={(e) => setNullifierInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          style={styles.checkButton}
          onClick={() => void check()}
          disabled={!normalized}
        >
          Check on-chain state
        </button>
        <div style={styles.result} aria-live="polite">
          {status.kind === "idle" && (
            <span style={styles.dim}>No check run yet.</span>
          )}
          {status.kind === "checking" && (
            <span style={styles.dim}>Reading contract state…</span>
          )}
          {status.kind === "awaiting-deploy" && (
            <span style={styles.warn}>
              No address entered — Wave 3 preprod deploy pending.
            </span>
          )}
          {status.kind === "found" && (
            <div>
              <div style={styles.foundTitle}>NULLIFIER FOUND ON-CHAIN</div>
              <div style={styles.mono}>state {status.stateSha256}</div>
              <div style={styles.mono}>nullifier {status.nullifier}</div>
            </div>
          )}
          {status.kind === "not-found" && (
            <div>
              <div style={styles.notFoundTitle}>NO RECORD FOUND</div>
              <div style={styles.mono}>state {status.stateSha256}</div>
              <div style={styles.dim}>
                State WAS read and has no entry. Shown only after a successful
                read — never on indexer failure.
              </div>
            </div>
          )}
          {status.kind === "indexer-error" && (
            <div style={styles.error}>Indexer error: {status.message}</div>
          )}
        </div>
        {snippet && (
          <>
            <h2 style={styles.h2}>Do not trust this button</h2>
            <p style={styles.dim}>
              The button runs our code. These run nothing of ours.
            </p>
            {(
              [
                ["console", "Console snippet", snippet],
                ["terminal", "Terminal one-liner", oneLiner],
                ["ai", "AI prompt", prompt],
              ] as const
            ).map(([key, title, text]) => (
              <div key={key} style={styles.snippetBox}>
                <div style={styles.snippetHead}>
                  <span>{title}</span>
                  <button
                    type="button"
                    style={styles.copyButton}
                    onClick={() => void copy(key, text)}
                  >
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre style={styles.pre}>{text}</pre>
              </div>
            ))}
          </>
        )}
        <h2 style={styles.h2}>Honest limits</h2>
        <ul style={styles.list}>
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
    </main>
  );
}
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "48px 16px",
    background: "#080812",
    color: "#fff",
  },
  card: {
    width: "100%",
    maxWidth: 760,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: 800, color: "#a78bfa" },
  title: { fontSize: 32, fontWeight: 900, margin: 0 },
  lede: { fontSize: 15, lineHeight: 1.5, color: "#bbb", margin: 0 },
  label: { fontSize: 12, fontWeight: 700, color: "#999", marginTop: 8 },
  input: {
    background: "#111",
    border: "1px solid #333",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "monospace",
    width: "100%",
    boxSizing: "border-box",
  },
  warn: { fontSize: 13, color: "#fbbf24" },
  checkButton: {
    background: "#6d28d9",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "14px 24px",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    marginTop: 4,
  },
  result: {
    background: "#000",
    border: "1px solid #333",
    borderRadius: 14,
    padding: 16,
    minHeight: 64,
    fontSize: 14,
  },
  dim: { color: "#999", fontSize: 13, lineHeight: 1.5 },
  mono: { fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" },
  foundTitle: { color: "#4ade80", fontWeight: 900, letterSpacing: 1 },
  notFoundTitle: { color: "#fb7185", fontWeight: 900, letterSpacing: 1 },
  error: { color: "#fbbf24", fontSize: 13 },
  h2: { fontSize: 18, fontWeight: 800, margin: "16px 0 0" },
  list: { fontSize: 13, lineHeight: 1.6, color: "#aaa", paddingLeft: 20 },
  snippetBox: {
    background: "#000",
    border: "1px solid #333",
    borderRadius: 12,
  },
  snippetHead: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
  },
  copyButton: {
    background: "#222",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: 8,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
  pre: {
    margin: 0,
    padding: 12,
    fontSize: 11.5,
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    borderTop: "1px solid #222",
  },
};
