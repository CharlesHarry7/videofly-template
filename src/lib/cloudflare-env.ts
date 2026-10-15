import { getCloudflareContext } from "@opennextjs/cloudflare";

// biome-ignore lint/suspicious/noExplicitAny: Worker env bindings are untyped here
type WorkerEnv = Record<string, any>;

export function getWorkerEnv(): WorkerEnv | undefined {
  try {
    return getCloudflareContext().env as unknown as WorkerEnv;
  } catch {
    return undefined;
  }
}

export function getHyperdriveConnectionString(): string | undefined {
  const value = getWorkerEnv()?.HYPERDRIVE?.connectionString;
  return typeof value === "string" && value ? value : undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: Images binding type
export function getImagesBinding(): any | undefined {
  return getWorkerEnv()?.IMAGES;
}
