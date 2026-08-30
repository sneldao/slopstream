import type { CSSProperties } from "react";

const SPHERES = [
  ["8%", "14%", 92, "var(--slop-coral)", -2, 17],
  ["23%", "72%", 142, "var(--slop-blue)", -8, 23],
  ["41%", "18%", 74, "var(--slop-lime)", -4, 15],
  ["58%", "68%", 186, "var(--slop-yellow)", -11, 27],
  ["76%", "13%", 128, "var(--slop-violet)", -6, 21],
  ["90%", "62%", 96, "var(--slop-coral)", -13, 18],
  ["4%", "48%", 48, "var(--slop-yellow)", -9, 14],
  ["34%", "43%", 54, "var(--slop-violet)", -14, 19],
  ["70%", "42%", 66, "var(--slop-blue)", -3, 16],
  ["84%", "87%", 152, "var(--slop-lime)", -17, 25],
  ["48%", "92%", 60, "var(--slop-coral)", -7, 16],
  ["95%", "25%", 42, "var(--slop-yellow)", -12, 13],
] as const;

type SphereStyle = CSSProperties & {
  "--sphere-x": string;
  "--sphere-y": string;
  "--sphere-size": string;
  "--sphere-color": string;
  "--sphere-delay": string;
  "--sphere-speed": string;
};

export function SphereField({ className = "" }: { className?: string }) {
  return (
    <div className={`sphere-field ${className}`} aria-hidden="true">
      {SPHERES.map(([x, y, size, color, delay, speed], index) => (
        <i
          key={`${x}-${y}`}
          className="sphere-field__orb"
          style={
            {
              "--sphere-x": x,
              "--sphere-y": y,
              "--sphere-size": `${size}px`,
              "--sphere-color": color,
              "--sphere-delay": `${delay}s`,
              "--sphere-speed": `${speed}s`,
            } as SphereStyle
          }
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
        </i>
      ))}
    </div>
  );
}
