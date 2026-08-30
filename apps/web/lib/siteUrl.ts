/**
 * Canonical public origin for SEO metadata (sitemap, robots, manifest,
 * layout). Single source of truth so the fallback lives in one place.
 * `NEXT_PUBLIC_SITE_URL` is build-inlined by Next.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
