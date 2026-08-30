import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon — a rounded squircle in Slopstream cream with the brand's
 * signature yellow dot, echoing the "live attention" stamp on the homepage.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080812",
          borderRadius: "26%",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#ffe45e",
            boxShadow: "0 0 0 3px #080812, 0 0 0 5px #ff5c58",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
