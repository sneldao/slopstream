import type { ReactNode } from "react";
import { SurfaceNav } from "./SurfaceNav";

/** Thin wrapper so product pages import a familiar name. */
export function SurfaceHeader({
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
  return (
    <SurfaceNav
      subtitle={subtitle}
      trailing={trailing}
      showDock={showDock}
      tone={tone}
      sticky={sticky}
      variant={variant}
      hidden={hidden}
    />
  );
}
