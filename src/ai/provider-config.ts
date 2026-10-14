import type { ProviderType } from "./types";

export const AI_PROVIDERS = ["evolink", "kie", "apimart"] as const;

export function parseProviderType(
  value: string | null | undefined
): ProviderType | undefined {
  if (!value) return undefined;
  if ((AI_PROVIDERS as readonly string[]).includes(value)) {
    return value as ProviderType;
  }
  return undefined;
}

export function getConfiguredAIProvider(): ProviderType | undefined {
  const raw = process.env.DEFAULT_AI_PROVIDER || "kie";
  if (!raw) return undefined;

  const provider = parseProviderType(raw);
  if (!provider) {
    throw new Error(
      `Invalid DEFAULT_AI_PROVIDER: ${raw}. Expected one of: ${AI_PROVIDERS.join(", ")}`
    );
  }

  return provider;
}

export function getProviderApiKey(
  provider: ProviderType
): string | undefined {
  switch (provider) {
    case "evolink":
      return process.env.EVOLINK_API_KEY;
    case "kie":
      return process.env.KIE_API_KEY;
    case "apimart":
      return process.env.APIMART_API_KEY;
    default:
      return undefined;
  }
}

export function requireProviderApiKey(provider: ProviderType): string {
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider}". Configure ${provider.toUpperCase()}_API_KEY before using this provider.`
    );
  }
  return apiKey;
}
