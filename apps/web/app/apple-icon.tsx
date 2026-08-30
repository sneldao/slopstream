import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon — cream squircle (no rounded corners on this size;
 * iOS applies its own mask) with the yellow "live" dot + coral ring.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080812",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: "#ffe45e",
          boxShadow: "0 0 0 14px #080812, 0 0 0 24px #ff5c58",
        }}
      />
    </div>,
    { ...size },
  );
}
