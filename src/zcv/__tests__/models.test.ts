import { describe, expect, it } from "vitest";

import {
  getProviderModelId,
  transformParamsForProvider,
} from "@/ai/model-mapping";

describe("KIE model ids from docs", () => {
  it("maps nano-banana-2 image edit params", () => {
    expect(getProviderModelId("nano-banana-2", "kie")).toBe("nano-banana-2");
    const body = transformParamsForProvider("nano-banana-2", "kie", {
      prompt: "cartoon zombie couple",
      imageUrls: ["https://example.test/photo.jpg"],
      quality: "1K",
    });
    expect(body.input.image_input).toEqual(["https://example.test/photo.jpg"]);
    expect(body.input.resolution).toBe("1K");
    expect(body.input.output_format).toBe("png");
  });

  it("maps kling-2.6/image-to-video 5s silent params", () => {
    expect(getProviderModelId("kling-2.6-i2v", "kie")).toBe(
      "kling-2.6/image-to-video"
    );
    const body = transformParamsForProvider("kling-2.6-i2v", "kie", {
      prompt: "animate portrait",
      imageUrls: ["https://example.test/zombie.png"],
      duration: 5,
      generateAudio: false,
    });
    expect(body.input.image_urls).toEqual(["https://example.test/zombie.png"]);
    expect(body.input.sound).toBe(false);
    expect(body.input.duration).toBe("5");
  });
});
