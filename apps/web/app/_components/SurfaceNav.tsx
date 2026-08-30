"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/screen", label: "Watch" },
  { href: "/listen", label: "Listen" },
  { href: "/brand", label: "Brand" },
] as const;

/**
 * Shared navigation across product surfaces.
 * - `default` — wordmark + Watch / Listen / Brand + optional mobile dock.
 * - `spectacle` — Continuum home: wordmark only in the header; dock on mobile.
 */
export function SurfaceNav({
  subtitle,
  trailing,
  showDock = true,
  tone = "dark",
  sticky = false,
  variant = "default",
  hidden = false,
}: {
  subtitle?: string;
  trailing?: ReactNode;
  showDock?: boolean;
  tone?: "dark" | "light";
  sticky?: boolean;
  variant?: "default" | "spectacle";
  hidden?: boolean;
}) {
  const pathname = usePathname() ?? "/";

  if (hidden) return null;

  const isHome = pathname.startsWith("/screen");

  return (
    <>
      <header
        className={[
          "slop-nav",
          `slop-nav--${tone}`,
          showDock ? "slop-nav--docked" : "",
          sticky ? "slop-nav--screen" : "",
          variant === "spectacle" ? "slop-nav--spectacle" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="slop-nav__brand">
          {isHome ? (
            <span className="slop-wordmark-chip" aria-current="page">
              Slopstream
            </span>
          ) : (
            <a className="slop-wordmark-chip" href="/screen" aria-label="Watch">
              Slopstream
            </a>
          )}
          {subtitle && variant !== "spectacle" ? (
            <span className="slop-nav__subtitle">{subtitle}</span>
          ) : null}
        </div>

        {variant !== "spectacle" ? (
          <nav className="slop-nav__switcher" aria-label="Navigate">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`slop-nav__link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        ) : null}

        {trailing ? (
          <div className="slop-nav__trail">{trailing}</div>
        ) : (
          <div
            className="slop-nav__trail slop-nav__trail--spacer"
            aria-hidden
          />
        )}
      </header>

      {showDock ? (
        <nav className="slop-dock" aria-label="Navigate">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`slop-dock__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
