import type { ScrapedCompanySubmission } from "@slopstream/shared";

/** Scraped startups consumed by no-bid auction slots (cold-start filler). */
export const DEMO_SCRAPED_COMPANIES: ScrapedCompanySubmission[] = [
  {
    name: "Zephyr Labs",
    source: "hacker_news",
    sourceUrl: "https://news.ycombinator.com/item?id=demo-zephyr",
    tagline: "GPU scheduling for chaotic teams",
    description:
      "Batch inference orchestration that respects budget caps and actually finishes.",
  },
  {
    name: "Patchwork AI",
    source: "product_hunt",
    sourceUrl: "https://www.producthunt.com/posts/patchwork-ai-demo",
    tagline: "Diff-aware code review that ships",
    description:
      "Reviews pull requests with context from your runbooks, not generic lint noise.",
  },
  {
    name: "Orbit Payroll",
    source: "hacker_news",
    sourceUrl: "https://news.ycombinator.com/item?id=demo-orbit",
    tagline: "Payroll for remote teams with weird tax situations",
    description:
      "Contractor payouts, equity grants, and compliance nags in one dashboard.",
  },
  {
    name: "Moss Analytics",
    source: "product_hunt",
    sourceUrl: "https://www.producthunt.com/posts/moss-analytics-demo",
    tagline: "Product analytics without the enterprise tax",
    description:
      "Funnels, retention, and session replay sized for seed-stage teams.",
  },
  {
    name: "Driftwood CMS",
    source: "hacker_news",
    sourceUrl: "https://news.ycombinator.com/item?id=demo-driftwood",
    tagline: "Headless CMS that still feels like a CMS",
    description:
      "Markdown-first editing with structured fields when marketing needs them.",
  },
  {
    name: "Nimbus Freight",
    source: "product_hunt",
    sourceUrl: "https://www.producthunt.com/posts/nimbus-freight-demo",
    tagline: "Instant LTL quotes for Shopify merchants",
    description:
      "Compare carriers, print labels, and track pallets without a logistics team.",
  },
  {
    name: "Circuit Garden",
    source: "hacker_news",
    sourceUrl: "https://news.ycombinator.com/item?id=demo-circuit",
    tagline: "Hardware BOM collaboration in the browser",
    description:
      "Shared schematic reviews, supplier alternates, and cost rollups for prototypes.",
  },
  {
    name: "Lumen Desk",
    source: "product_hunt",
    sourceUrl: "https://www.producthunt.com/posts/lumen-desk-demo",
    tagline: "Customer support that remembers context",
    description:
      "Threads, macros, and AI drafts grounded in your help center and changelog.",
  },
];
