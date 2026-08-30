import { ImageResponse } from "next/og";

export const alt = "Slopstream — the live attention market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OpenGraph / Twitter card image.
 *
 * The composition mirrors the homepage hero: a dark midnight field, the
 * Slopstream wordmark in the condensed display weight, and the "live
 * attention market" stamp with the brand's yellow + coral palette.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#080812",
        fontFamily: "Helvetica Neue, Arial, sans-serif",
      }}
    >
      {/* Ambient brand dots */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 100,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "#ff5c58",
          opacity: 0.18,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 60,
          right: 120,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "#45a7ff",
          opacity: 0.14,
          filter: "blur(70px)",
        }}
      />

      {/* Wordmark */}
      <div
        style={{
          display: "flex",
          fontSize: 120,
          fontWeight: 900,
          color: "#f4f1e8",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        <span>Slop</span>
        <span style={{ color: "#ffe45e" }}>Stream</span>
      </div>

      {/* Stamp */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(244,241,232,0.6)",
        }}
      >
        <span>Live</span>
        <span style={{ color: "#ffe45e" }}>Attention</span>
        <span>Market</span>
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 40,
          fontSize: 28,
          fontWeight: 600,
          color: "rgba(244,241,232,0.5)",
        }}
      >
        Bid for the moment. Reward the people who were really there.
      </div>
    </div>,
    { ...size },
  );
}
