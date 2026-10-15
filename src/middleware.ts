import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";

import { crawlerPolicy } from "@/lib/crawler";

const intlMiddleware = createMiddleware(routing);

/**
 * Legacy dashboard redirects
 * Maps old dashboard routes to new routes
 */
const legacyRedirects: Record<string, string> = {
  "/dashboard": "/",
  "/dashboard/videos": "/orders",
  "/dashboard/billing": "/orders",
  "/dashboard/settings": "/orders",
  "/settings": "/orders",
  "/privacy-policy": "/privacy",
  "/terms-of-service": "/terms",
};

/**
 * Next-intl middleware with legacy dashboard redirects
 *
 * URL structure:
 * - English (default): /about, /pricing
 * - Other locales: /zh/about, /ko/pricing
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for legacy dashboard routes (without locale prefix)
  for (const [from, to] of Object.entries(legacyRedirects)) {
    if (pathname === from || pathname.startsWith(from + "/")) {
      const rest = pathname.slice(from.length);
      const url = request.nextUrl.clone();
      url.pathname = to + rest;
      return NextResponse.redirect(url);
    }
  }

  for (const locale of routing.locales) {
    for (const [from, to] of Object.entries(legacyRedirects)) {
      const localeFrom = `/${locale}${from}`;
      if (pathname === localeFrom || pathname.startsWith(localeFrom + "/")) {
        const rest = pathname.slice(localeFrom.length);
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}${to}${rest}`;
        return NextResponse.redirect(url);
      }
    }
  }

  const response = intlMiddleware(request);
  const policy = crawlerPolicy(request.nextUrl.hostname, process.env);
  if (policy.robotsTag) {
    response.headers.set("X-Robots-Tag", policy.robotsTag);
  }

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next|.*\\..*).*)",
    "/",
  ],
};
