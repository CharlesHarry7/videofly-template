import sharp from "sharp";

export async function createWatermarkedPreview(input: Buffer): Promise<Buffer> {
  const resized = sharp(input).rotate().resize({
    width: 512,
    height: 512,
    fit: "inside",
    withoutEnlargement: true,
  });
  const metadata = await resized.metadata();
  const width = metadata.width || 512;
  const height = metadata.height || 512;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${Math.max(height - 56, 0)}" width="${width}" height="56" fill="rgba(0,0,0,0.45)" />
      <text x="50%" y="${height - 22}" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif">
        PREVIEW IMAGE — NOT THE VIDEO
      </text>
    </svg>
  `;
  return resized
    .composite([{ input: Buffer.from(svg), gravity: "southeast" }])
    .jpeg({ quality: 48 })
    .toBuffer();
}
