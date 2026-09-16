import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMintArgs } from "./mint-evergreen.js";
import { mintEntry, slugFor } from "./mint-evergreen-lib.js";

describe("mint-evergreen", () => {
  it("parses args with parody label default", () => {
    const args = parseMintArgs([
      "--in",
      "q.json",
      "--catalog-dir",
      "c",
      "--media-dir",
      "m",
      "--brandId",
      "brand_acme",
    ]);
    expect(args.tier).toBe("audio_image");
    expect(args.label).toContain("Unofficial AI-generated parody");
    expect(() => parseMintArgs(["--in", "q.json"])).toThrow(/usage/);
    expect(() =>
      parseMintArgs([
        "--in",
        "q.json",
        "--catalog-dir",
        "c",
        "--media-dir",
        "m",
        "--brandId",
        "b",
        "--tier",
        "hologram",
      ]),
    ).toThrow(/--tier/);
  });

  it("slugs entry ids per brand", () => {
    expect(slugFor("brand_acme", 0)).toBe("acme_01");
    expect(slugFor("brand_x", 11)).toBe("x_12");
  });

  it("mints content-addressed entry JSON with parody brief", async () => {
    const audioBytes = Buffer.from("mint-audio");
    const sha = createHash("sha256").update(audioBytes).digest("hex");
    const written = new Map<string, Buffer | string>();
    const out = await mintEntry(
      {
        media: {
          version: 1,
          durationSec: 18,
          audio: { url: "https://cdn.test/a.mp3", contentType: "audio/mpeg" },
        },
        transcript: "Acme launches Rockets today.",
        summary: "Acme launch",
      },
      0,
      {
        input: "q",
        catalogDir: "catalog",
        mediaDir: "media",
        brandId: "brand_acme",
        tier: "audio",
        label: "Unofficial AI-generated parody ad.",
        dryRun: false,
      },
      (p, b) => void written.set(p, b),
      async () => audioBytes,
    );
    expect(out.id).toBe("evergreen_acme_01");
    expect(out.audioKey).toBe(`audio/${sha}.mp3`);
    const entry = JSON.parse(
      String(written.get("catalog/evergreen_acme_01.json")),
    );
    expect(entry.brief).toContain("Unofficial AI-generated parody");
    expect(entry.media.audio.sha256).toBe(sha);
  });

  it("rejects keeper gaps (missing audio/transcript)", async () => {
    const args = {
      input: "q",
      catalogDir: "c",
      mediaDir: "m",
      brandId: "brand_acme",
      tier: "audio",
      label: "L",
      dryRun: true,
    };
    await expect(mintEntry({ transcript: "hi" }, 0, args)).rejects.toThrow(
      /media.audio.url/,
    );
    await expect(
      mintEntry(
        {
          media: {
            version: 1,
            durationSec: 18,
            audio: { url: "https://cdn.test/a.mp3", contentType: "audio/mpeg" },
          },
          transcript: "  ",
        },
        0,
        args,
      ),
    ).rejects.toThrow(/transcript/);
  });
});
