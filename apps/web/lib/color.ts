/**
 * Convert a #rgb / #rrggbb hex colour to an rgba() string with the given
 * alpha. Shared by every canvas surface that paints gradients (big screen,
 * listener visualizer, brand console glow).
 */
export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
