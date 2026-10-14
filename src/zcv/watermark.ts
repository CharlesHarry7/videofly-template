import sharp from "sharp";

export async function createWatermarkedPreview(input: Buffer): Promise<Buffer> {
  const { data: resized, info } = await sharp(input)
    .rotate()
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${Math.max(height - 56, 0)}" width="${width}" height="56" fill="rgba(0,0,0,0.45)" />
      <text x="50%" y="${height - 22}" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif">
        PREVIEW IMAGE — NOT THE VIDEO
      </text>
    </svg>
  `;
  return sharp(resized)
    .composite([{ input: Buffer.from(svg), gravity: "southeast" }])
    .jpeg({ quality: 48 })
    .toBuffer();
}

export async function createLocalMockPreview(input: Buffer): Promise<Buffer> {
  const preview = await createWatermarkedPreview(input);
  const metadata = await sharp(preview).metadata();
  const width = metadata.width ?? 512;
  const height = metadata.height ?? 512;
  const bannerHeight = Math.min(54, height);
  const fontSize = Math.max(1, Math.min(20, Math.floor(bannerHeight * 0.36)));
  const svg = `
    <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(153,27,27,0.94)" />
      <text x="50%" y="${Math.max(fontSize, bannerHeight * 0.65)}"
        text-anchor="middle" fill="white" font-size="${fontSize}"
        font-family="sans-serif">LOCAL MOCK — NO AI MODEL CALLED</text>
    </svg>
  `;
  return sharp(preview)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 60 })
    .toBuffer();
}
