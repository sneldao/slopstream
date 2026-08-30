"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export type SurfaceRole = "01" | "02" | "03";

const SURFACES = [
  {
    role: "01" as const,
    href: "/screen",
    short: "Screen",
    label: "The spectacle",
  },
  {
    role: "02" as const,
    href: "/listen",
    short: "Listen",
    label: "The pocket portal",
  },
  {
    role: "03" as const,
    href: "/brand",
    short: "Brand",
    label: "The auction cockpit",
  },
] as const;

/**
 * Shared navigation across home + product surfaces.
 * Desktop: cream wordmark + role switcher + trailing actions.
 * Mobile: compact header + bottom dock for thumb reach.
 */
export function SurfaceNav({
  role,
  subtitle,
  trailing,
  showDock = true,
  tone = "dark",
  sticky = false,
}: {
  role?: SurfaceRole;
  subtitle?: string;
  trailing?: ReactNode;
  /** Bottom dock on small screens — off for presentation theater. */
  showDock?: boolean;
  tone?: "dark" | "light";
  /** Fixed top bar (big screen / continuum). */
  sticky?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const activeRole =
    role ??
    (pathname.startsWith("/screen")
      ? "01"
      : pathname.startsWith("/listen")
        ? "02"
        : pathname.startsWith("/brand")
          ? "03"
          : undefined);

  return (
    <>
      <header
        className={`slop-nav slop-nav--${tone}${showDock ? " slop-nav--docked" : ""}${sticky ? " slop-nav--screen" : ""}`}
      >
        <div className="slop-nav__brand">
          <a
            className="slop-wordmark-chip"
            href="/"
            aria-label="Slopstream home"
          >
            Slopstream
          </a>
          {subtitle ? (
            <span className="slop-nav__subtitle">{subtitle}</span>
          ) : null}
        </div>

        <nav className="slop-nav__switcher" aria-label="Surfaces">
          {SURFACES.map((surface) => {
            const active = surface.role === activeRole;
            return (
              <a
                key={surface.href}
                href={surface.href}
                className={`slop-nav__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="slop-nav__index">{surface.role}</span>
                <span className="slop-nav__short">{surface.short}</span>
                <span className="slop-nav__label">{surface.label}</span>
              </a>
            );
          })}
        </nav>

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
        <nav className="slop-dock" aria-label="Quick surface switch">
          <a
            className={`slop-dock__link${pathname === "/" ? " is-active" : ""}`}
            href="/"
          >
            Home
          </a>
          {SURFACES.map((surface) => {
            const active = surface.role === activeRole;
            return (
              <a
                key={surface.href}
                href={surface.href}
                className={`slop-dock__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span>{surface.role}</span>
                {surface.short}
              </a>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
