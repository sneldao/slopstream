import type { ReactNode } from "react";
import { SurfaceNav, type SurfaceRole } from "./SurfaceNav";

/**
 * Compatibility wrapper — product pages use SurfaceHeader; navigation now
 * lives in SurfaceNav (role switcher + mobile dock).
 */
export function SurfaceHeader({
  role,
  subtitle,
  trailing,
  showDock = true,
  tone = "dark",
  sticky = false,
  minimal = false,
  hidden = false,
}: {
  role: SurfaceRole;
  subtitle?: string;
  trailing?: ReactNode;
  showDock?: boolean;
  tone?: "dark" | "light";
  sticky?: boolean;
  minimal?: boolean;
  hidden?: boolean;
}) {
  return (
    <SurfaceNav
      role={role}
      subtitle={subtitle}
      trailing={trailing}
      showDock={showDock}
      tone={tone}
      sticky={sticky}
      minimal={minimal}
      hidden={hidden}
    />
  );
}
