import { PRODUCTION_URL } from "@/lib/site";

export function hostnameFromHostHeader(host: string | null | undefined) {
  return (host || "").split(":")[0].trim().toLowerCase();
}

type EnvBag = Record<string, string | undefined>;

export function isNoindexHost(
  hostname: string | null | undefined,
  env: EnvBag = process.env
) {
  if (env.ZCV_NOINDEX === "true") return true;
  if (env.CLOUDFLARE_ENV === "sandbox") return true;
  return hostnameFromHostHeader(hostname).endsWith(".workers.dev");
}

export function crawlerPolicy(
  hostname: string | null | undefined,
  env: EnvBag = process.env
) {
  if (isNoindexHost(hostname, env)) {
    return {
      noindex: true as const,
      robotsTag: "noindex, nofollow",
      allow: false as const,
      sitemap: undefined,
    };
  }
  return {
    noindex: false as const,
    robotsTag: undefined,
    allow: true as const,
    sitemap: `${env.NEXT_PUBLIC_APP_URL || PRODUCTION_URL}/sitemap.xml`,
  };
}
