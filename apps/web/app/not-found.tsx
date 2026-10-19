import { SurfaceHeader } from "./_components/SurfaceHeader";

export default function NotFound() {
  return (
    <main className="slop-surface-shell has-dock">
      <SurfaceHeader subtitle="Stream" tone="dark" />
      <div className="slop-stop">
        <span className="slop-kicker" style={{ color: "var(--slop-violet)" }}>
          Off the dial
        </span>
        <h1 className="slop-stop__title">No such surface</h1>
        <p className="slop-stop__body">
          Slopstream has four: the live stream, the listener client, the brand
          console, and public verification.
        </p>
        <div className="slop-stop__actions">
          <a href="/">Watch</a>
          <a href="/listen">Earn</a>
          <a href="/brand">Sponsor</a>
          <a href="/verify">Verify</a>
        </div>
      </div>
    </main>
  );
}
