// biome-ignore lint/suspicious/noExplicitAny: Cloudflare Images binding
export type ImagesBinding = any;

export interface ImageHeaderInfo {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

export function readImageHeader(buf: Uint8Array): ImageHeaderInfo | undefined {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = (buf[i + 2] << 8) | buf[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: "jpeg", height: (buf[i + 5] << 8) | buf[i + 6], width: (buf[i + 7] << 8) | buf[i + 8] };
      }
      i += 2 + len;
    }
    return undefined;
  }
  if (buf.length >= 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === "VP8X") {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { format: "webp", width: w, height: h };
    }
    if (chunk === "VP8 ") {
      return { format: "webp", width: (buf[26] | (buf[27] << 8)) & 0x3fff, height: (buf[28] | (buf[29] << 8)) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const b = buf.subarray(21, 25);
      const w = 1 + (((b[1] & 0x3f) << 8) | b[0]);
      const h = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
      return { format: "webp", width: w, height: h };
    }
  }
  return undefined;
}

function toStream(input: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(input).body as ReadableStream<Uint8Array>;
}

async function render(images: ImagesBinding, input: Buffer, text: string, position: Record<string, number>, quality: number): Promise<Buffer> {
  if (!images) {
    throw new Error("IMAGES binding required for watermarking");
  }
  const result = await images
    .input(toStream(input))
    .transform({ width: 512, height: 512, fit: "scale-down" })
    .draw(images.text(text, { color: "#FFFFFF", size: 22 }), position)
    .output({ format: "image/jpeg", quality });
  const response: Response = result.response();
  return Buffer.from(await response.arrayBuffer());
}

export function createWatermarkedPreview(input: Buffer, images: ImagesBinding): Promise<Buffer> {
  return render(images, input, "PREVIEW IMAGE - NOT THE VIDEO", { bottom: 16 }, 48);
}

export async function createLocalMockPreview(input: Buffer, images: ImagesBinding): Promise<Buffer> {
  // Local Node dev mock has no Workers IMAGES binding; return the upload unchanged.
  if (!images) return input;
  return render(images, input, "LOCAL MOCK - NO AI MODEL CALLED", { top: 8 }, 60);
}
