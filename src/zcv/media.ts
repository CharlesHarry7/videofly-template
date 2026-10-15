import { hmacHex, safeEqual } from "./crypto";

export interface MediaTokenPayload {
  key: string;
  purpose: "preview" | "download" | "provider-fetch";
  userId?: string;
  orderId?: string;
  exp: number;
}

export function createMediaToken(
  secret: string,
  payload: MediaTokenPayload
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmacHex(secret, body);
  return `${body}.${sig}`;
}

export function verifyMediaToken(
  secret: string,
  token: string,
  now = Date.now()
): MediaTokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new Error("Invalid media token");
  }
  const expected = hmacHex(secret, body);
  if (!safeEqual(sig, expected)) {
    throw new Error("Invalid media token");
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as MediaTokenPayload;
  if (!payload.exp || payload.exp < now) {
    throw new Error("Media token expired");
  }
  return payload;
}
