export const i18n = {
  defaultLocale: "en",
  locales: ["en"],
} as const;

export type Locale = (typeof i18n.locales)[number];

export const localeConfig = {
  en: {
    flag: "🇺🇸",
    name: "English",
    hreflang: "en",
  },
} as const;

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const localeMap = {
  en: "English",
} as const;
