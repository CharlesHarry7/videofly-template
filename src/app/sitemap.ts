import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/lib/site";

export const revalidate = 3600;

const PUBLIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly";
}> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "contact", priority: 0.4, changeFrequency: "monthly" },
  { path: "privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "refund", priority: 0.3, changeFrequency: "monthly" },
];

export const SITEMAP_EXCLUDED_PATHS = [
  "zombie-couple-video",
  "platform",
  "image-to-video",
  "text-to-video",
  "reference-to-video",
  "seedance-1-5",
  "sora-2",
  "veo-3-1",
  "wan-2-6",
  "credits",
  "my-creations",
  "privacy-policy",
  "terms-of-service",
  "dashboard",
  "admin",
  "login",
  "register",
  "settings",
  "orders",
  "success",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicAppUrl();
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path ? `/${route.path}` : ""}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
