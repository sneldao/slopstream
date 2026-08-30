import { redirect } from "next/navigation";

/** Legacy URL — the Continuum lives at `/`. */
export default function ScreenRedirect() {
  redirect("/");
}
