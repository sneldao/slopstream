import type { ReactNode } from "react";

const ROLE_LABEL: Record<"01" | "02" | "03", string> = {
  "01": "The spectacle",
  "02": "The pocket portal",
  "03": "The auction cockpit",
};

/**
 * Shared chrome for listen / brand / screen — cream wordmark chip + numbered
 * role badge so dark surfaces still feel like the home lobby.
 */
export function SurfaceHeader({
  role,
  subtitle,
  trailing,
}: {
  role: "01" | "02" | "03";
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="slop-surface-header">
      <div className="slop-surface-header__brand">
        <a className="slop-wordmark-chip" href="/" aria-label="Slopstream home">
          Slopstream
        </a>
        <span className="slop-role-badge" data-role={role}>
          <span>{role}</span>
          {ROLE_LABEL[role]}
        </span>
        {subtitle ? (
          <span className="slop-surface-header__sub">{subtitle}</span>
        ) : null}
      </div>
      {trailing ? (
        <div className="slop-surface-header__trail">{trailing}</div>
      ) : null}
    </header>
  );
}
