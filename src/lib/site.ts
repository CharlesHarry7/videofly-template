export const PRODUCTION_DOMAIN = "zombiecouplevideo.com";
export const PRODUCTION_URL = `https://${PRODUCTION_DOMAIN}`;
export const SUPPORT_EMAIL =
  process.env.ZCV_SUPPORT_EMAIL || `support@${PRODUCTION_DOMAIN}`;
export const BRAND_NAME = "ZombieCoupleVideo";
export const KEYWORD_H1 = "Make Your Zombie Couple Video from Two Photos";
export const KEYWORD = "zombie couple video";

export function getPublicAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_URL;
}
