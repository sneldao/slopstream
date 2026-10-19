import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PayoutReceipt } from "@slopstream/shared";
import { PayoutSheet } from "./PayoutSheet";

const payout: PayoutReceipt = {
  payoutId: "pout_1",
  amountUsd: 4.25,
  status: "completed",
  createdAt: "2026-08-30T12:00:00.000Z",
};

function render(
  availableUsd: number,
  pendingUsd = 0,
  payoutHistory: PayoutReceipt[] = [],
) {
  return renderToStaticMarkup(
    <PayoutSheet
      open
      availableUsd={availableUsd}
      pendingUsd={pendingUsd}
      payoutHistory={payoutHistory}
      minimumUsd={1}
      onClose={() => {}}
      onRequest={() => {}}
    />,
  );
}

describe("PayoutSheet", () => {
  it("explains that a small available balance is below the minimum", () => {
    const html = render(0.5);
    expect(html).toContain("0.50 points to go");
    expect(html).toContain("Claims unlock at 1.00 points");
  });

  it("keeps the empty state distinct from a below-minimum balance", () => {
    const html = render(0, 2);
    expect(html).toContain("Nothing available yet");
    expect(html).not.toContain("points to go");
  });

  it("renders recent completed claim history", () => {
    const html = render(0, 0, [payout]);
    expect(html).toContain("Recent claims");
    expect(html).toContain("4.25 pts");
    expect(html).toContain("Aug");
  });

  it("never renders a currency sign — the balance is points, not money", () => {
    expect(render(12.5, 3, [payout])).not.toContain("$");
  });
});
