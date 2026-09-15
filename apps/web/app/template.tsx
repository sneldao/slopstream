/**
 * Page transition — a subtle CSS opacity fade on each navigation so
 * cross-surface movement feels seamless rather than jarring.
 *
 * Uses opacity only (no transform, no filter) so it does NOT create a
 * containing block for `position: fixed` descendants — the home page's
 * many fixed HUD elements remain relative to the viewport.
 *
 * The reduced-motion media query in globals.css already disables this
 * animation for users who prefer reduced motion.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="slop-page-enter">{children}</div>;
}
