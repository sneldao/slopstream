import { describe, expect, it, vi } from "vitest";

import {
  extractOgImageUrl,
  fetchOgImage,
  fetchContinuityImage,
} from "./ogImage.js";

const PAGE = "https://acme.example/launch";
const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("extractOgImageUrl", () => {
  it("extracts og:image with property-first attribute order", () => {
    const html =
      '<html><head><meta property="og:image" content="https://cdn.example/hero.png"></head></html>';
    expect(extractOgImageUrl(html, PAGE)).toBe("https://cdn.example/hero.png");
  });

  it("extracts when content comes before the property", () => {
    const html =
      "<meta content='https://cdn.example/hero.png' property='og:image'>";
    expect(extractOgImageUrl(html, PAGE)).toBe("https://cdn.example/hero.png");
  });

  it("falls back to twitter:image", () => {
    const html =
      '<meta name="twitter:image" content="https://cdn.example/t.jpg">';
    expect(extractOgImageUrl(html, PAGE)).toBe("https://cdn.example/t.jpg");
  });

  it("prefers og:image over twitter:image", () => {
    const html =
      '<meta name="twitter:image" content="https://cdn.example/t.jpg">' +
      '<meta property="og:image" content="https://cdn.example/og.jpg">';
    expect(extractOgImageUrl(html, PAGE)).toBe("https://cdn.example/og.jpg");
  });

  it("resolves relative URLs against the page", () => {
    const html = '<meta property="og:image" content="/static/hero.png">';
    expect(extractOgImageUrl(html, PAGE)).toBe(
      "https://acme.example/static/hero.png",
    );
  });

  it("rejects non-http schemes and missing tags", () => {
    expect(
      extractOgImageUrl(
        '<meta property="og:image" content="data:image/png;base64,AA">',
        PAGE,
      ),
    ).toBeUndefined();
    expect(
      extractOgImageUrl("<html><body>no meta</body></html>", PAGE),
    ).toBeUndefined();
  });
});

describe("fetchOgImage", () => {
  function htmlResponse(html: string): Response {
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }

  it("fetches the page and downloads the OG image as base64", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(
          '<meta property="og:image" content="https://cdn.example/hero.png">',
        ),
      )
      .mockResolvedValueOnce(
        new Response(PNG_MAGIC, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    const result = await fetchOgImage(PAGE, { fetcher });

    expect(result?.mimeType).toBe("image/png");
    expect(Buffer.from(result!.base64, "base64")).toEqual(
      Buffer.from(PNG_MAGIC),
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://cdn.example/hero.png");
  });

  it("sniffs magic bytes when content-type is generic", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(
          '<meta property="og:image" content="https://cdn.example/hero">',
        ),
      )
      .mockResolvedValueOnce(
        new Response(PNG_MAGIC, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
      );

    const result = await fetchOgImage(PAGE, { fetcher });
    expect(result?.mimeType).toBe("image/png");
  });

  it("returns null when the page 404s", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchOgImage(PAGE, { fetcher })).resolves.toBeNull();
  });

  it("returns null when there is no OG image tag", async () => {
    const fetcher = vi.fn().mockResolvedValue(htmlResponse("<html></html>"));
    await expect(fetchOgImage(PAGE, { fetcher })).resolves.toBeNull();
  });

  it("returns null for disallowed mime types", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38]);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(
          '<meta property="og:image" content="https://cdn.example/hero.gif">',
        ),
      )
      .mockResolvedValueOnce(
        new Response(gif, {
          status: 200,
          headers: { "content-type": "image/gif" },
        }),
      );
    await expect(fetchOgImage(PAGE, { fetcher })).resolves.toBeNull();
  });

  it("returns null when the network throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchOgImage(PAGE, { fetcher })).resolves.toBeNull();
  });
});

describe("fetchContinuityImage", () => {
  const URL = "http://localhost:4300/assets/prev.png";

  it("fetches an image directly and returns base64", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(PNG_MAGIC, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const result = await fetchContinuityImage(URL, { fetcher });
    expect(result?.mimeType).toBe("image/png");
    expect(Buffer.from(result!.base64, "base64")).toEqual(
      Buffer.from(PNG_MAGIC),
    );
  });

  it("returns null for non-image content types", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(fetchContinuityImage(URL, { fetcher })).resolves.toBeNull();
  });

  it("returns null when the URL 404s", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(fetchContinuityImage(URL, { fetcher })).resolves.toBeNull();
  });

  it("returns null when the fetch throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(fetchContinuityImage(URL, { fetcher })).resolves.toBeNull();
  });

  it("sniffs magic bytes when content-type is generic", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(PNG_MAGIC, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const result = await fetchContinuityImage(URL, { fetcher });
    expect(result?.mimeType).toBe("image/png");
  });
});
