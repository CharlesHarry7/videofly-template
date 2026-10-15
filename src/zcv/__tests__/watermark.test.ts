import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { createWatermarkedPreview } from "../watermark";

async function countBrightPixelsInCenterBand(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  const left = Math.floor(info.width * 0.35);
  const right = Math.ceil(info.width * 0.65);
  const top = Math.max(0, info.height - 56);
  for (let y = top; y < info.height; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * info.width + x) * info.channels;
      if (
        data[index] > 220 &&
        data[index + 1] > 220 &&
        data[index + 2] > 220
      ) {
        count += 1;
      }
    }
  }
  return count;
}

describe("watermarked preview dimensions", () => {
  it("centers the watermark after resizing a 1024 by 768 image", async () => {
    const input = await sharp({
      create: {
        width: 1024,
        height: 768,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();

    const output = await createWatermarkedPreview(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(384);
    expect(await countBrightPixelsInCenterBand(output)).toBeGreaterThan(50);
  });

  it("applies EXIF rotation before sizing a portrait preview and watermark", async () => {
    const input = await sharp({
      create: {
        width: 1024,
        height: 768,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await createWatermarkedPreview(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(384);
    expect(metadata.height).toBe(512);
    expect(await countBrightPixelsInCenterBand(output)).toBeGreaterThan(10);
  });
});
