import { describe, expect, it } from "vitest";

import { createWatermarkedPreview, readImageHeader } from "../watermark";
import { MockImagesBinding } from "./harness";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("watermarked preview via Images binding", () => {
  it("resizes to 512 and draws the preview watermark text", async () => {
    const images = new MockImagesBinding();
    const output = await createWatermarkedPreview(png, images);
    expect(output.length).toBeGreaterThan(0);
    expect(images.transforms[0]).toMatchObject({ width: 512, height: 512 });
    expect(images.draws[0].text).toContain("PREVIEW IMAGE");
    expect(images.outputs[0]).toMatchObject({ format: "image/jpeg" });
  });

  it("throws without an IMAGES binding", async () => {
    await expect(createWatermarkedPreview(png, undefined)).rejects.toThrow(
      "IMAGES binding required"
    );
  });

  it("reads PNG dimensions from the header", () => {
    expect(readImageHeader(png)).toEqual({ format: "png", width: 1, height: 1 });
    expect(readImageHeader(Buffer.from("not an image"))).toBeUndefined();
  });
});
