"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PayoutReceipt } from "@slopstream/shared";
import { errorMessage } from "@/lib/errors";

/**
 * Points ledger sheet — pending vs available, then claim. Deliberately not
 * called a payout and never shows a currency sign: the demo balance is a
 * scoreboard entry, and the submission story says so out loud.
 */
export function PayoutSheet({
  availableUsd,
  pendingUsd,
  payoutHistory,
  minimumUsd,
  open,
  onClose,
  onRequest,
}: {
  availableUsd: number;
  pendingUsd: number;
  payoutHistory: PayoutReceipt[];
  minimumUsd: number;
  open: boolean;
  onClose: () => void;
  onRequest: () => void | Promise<void>;
}) {
  const [done, setDone] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDone(false);
      setError(null);
      setRequesting(false);
    }
  }, [open]);

  const canCashOut = availableUsd >= minimumUsd;
  const shortfallUsd = Math.max(minimumUsd - availableUsd, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="slop-payout-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Claim points"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="slop-payout-sheet"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="slop-payout-sheet__kicker">Ledger</div>
            <h2>Claim points</h2>
            <p>
              Points move from pending to available when an ad&apos;s attention
              window closes. Claim once your balance reaches{" "}
              {minimumUsd.toFixed(2)} points. This demo records the claim to
              your ledger — it is a scoreboard entry, not a payment, and it
              settles nothing in cash.
            </p>

            <div className="slop-payout-sheet__rows">
              <div>
                <span>Pending</span>
                <strong>{pendingUsd.toFixed(2)} pts</strong>
              </div>
              <div>
                <span>Available to claim</span>
                <strong>{availableUsd.toFixed(2)} pts</strong>
              </div>
            </div>

            {done ? (
              <p className="slop-payout-sheet__done" role="status">
                Claimed — logged to your ledger.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="slop-payout-sheet__cta"
                  disabled={!canCashOut || requesting}
                  onClick={() => {
                    setError(null);
                    setRequesting(true);
                    void (async () => {
                      try {
                        await onRequest();
                        setDone(true);
                      } catch (err: unknown) {
                        // Handled here so a failed payout never becomes an
                        // unhandled promise rejection.
                        setError(
                          errorMessage(err, "Unable to request payout."),
                        );
                      } finally {
                        setRequesting(false);
                      }
                    })();
                  }}
                >
                  {requesting
                    ? "Claiming…"
                    : canCashOut
                      ? `Claim ${availableUsd.toFixed(2)} points`
                      : availableUsd > 0
                        ? `${shortfallUsd.toFixed(2)} points to go`
                        : "Nothing available yet"}
                </button>
                {!canCashOut && availableUsd > 0 && (
                  <p className="slop-payout-sheet__hint">
                    Claims unlock at {minimumUsd.toFixed(2)} points. Keep
                    listening to build your balance.
                  </p>
                )}
              </>
            )}

            {payoutHistory.length > 0 && (
              <section
                className="slop-payout-sheet__history"
                aria-label="Claim history"
              >
                <div className="slop-payout-sheet__history-title">
                  Recent claims
                </div>
                {payoutHistory.slice(0, 5).map((payout) => (
                  <div
                    className="slop-payout-sheet__history-row"
                    key={payout.payoutId}
                  >
                    <span>
                      {new Date(payout.createdAt).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                    <strong>{payout.amountUsd.toFixed(2)} pts</strong>
                    <small>{payout.status}</small>
                  </div>
                ))}
              </section>
            )}

            {error && (
              <p className="slop-payout-sheet__error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="slop-payout-sheet__close"
              onClick={onClose}
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
