export default function Home() {
  return (
    <main style={styles.main}>
      <div className="slop-canvas" />
      <div style={styles.frame}>
        <h1 style={styles.title}>SLOPSTREAM</h1>
        <p style={styles.tagline}>
          The world&apos;s first live attention market.
        </p>

        <div style={styles.grid}>
          <SurfaceCard
            href="/screen"
            title="Big Screen"
            desc="The living canvas — stream, leaderboard, OUTBID, clearing animations. The centerpiece."
          />
          <SurfaceCard
            href="/listen"
            title="Listener Client"
            desc="QR join, audio visualizer, attention challenges, proof receipt. Mobile web."
          />
          <SurfaceCard
            href="/brand"
            title="Brand Console"
            desc="Balance, bid controls, OUTBID alerts, cost-per-verified-attention, slot countdown."
          />
        </div>

        <p style={styles.mode}>
          Running in <strong>demo mode</strong> — fixture-driven, no backend
          required. Set{" "}
          <code style={styles.code}>NEXT_PUBLIC_STREAM_MODE=live</code> to
          connect to the real API + WebSocket gateway.
        </p>
      </div>
    </main>
  );
}

function SurfaceCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <a href={href} style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardDesc}>{desc}</div>
      <div style={styles.cardArrow}>→</div>
    </a>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { position: "relative", minHeight: "100vh", overflow: "hidden" },
  frame: {
    position: "relative",
    zIndex: 1,
    maxWidth: 720,
    margin: "0 auto",
    padding: "clamp(40px, 10vh, 120px) 24px 40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
  },
  title: {
    fontSize: "clamp(40px, 8vw, 80px)",
    fontWeight: 900,
    letterSpacing: 8,
    color: "#fff",
    margin: 0,
    textShadow: "0 6px 40px rgba(0,0,0,0.5)",
  },
  tagline: {
    fontSize: "clamp(16px, 2.4vw, 24px)",
    color: "var(--platform-text-dim)",
    fontWeight: 600,
    margin: 0,
  },
  grid: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    width: "100%",
    marginTop: 16,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "20px 24px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    textDecoration: "none",
    color: "#fff",
    transition: "background 200ms ease, transform 200ms ease",
  },
  cardTitle: { fontSize: 22, fontWeight: 800 },
  cardDesc: {
    fontSize: 14,
    color: "var(--platform-text-dim)",
    fontWeight: 500,
    lineHeight: 1.5,
  },
  cardArrow: {
    fontSize: 18,
    color: "var(--platform-accent)",
    fontWeight: 800,
    alignSelf: "flex-end",
  },
  mode: {
    fontSize: 13,
    color: "var(--platform-text-dim)",
    textAlign: "center",
    lineHeight: 1.6,
    marginTop: 8,
  },
  code: {
    background: "rgba(255,255,255,0.1)",
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
  },
};
