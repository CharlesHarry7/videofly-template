import { expect, it } from "vitest";

it("keeps PGlite out of the Next.js server bundle", async () => {
  const previousSkipValidation = process.env.SKIP_ENV_VALIDATION;
  process.env.SKIP_ENV_VALIDATION = "1";
  try {
    const configModule = await import("../../../next.config.mjs");
    expect(configModule.default.serverExternalPackages).toContain(
      "@electric-sql/pglite"
    );
  } finally {
    if (previousSkipValidation === undefined) {
      Reflect.deleteProperty(process.env, "SKIP_ENV_VALIDATION");
    } else {
      process.env.SKIP_ENV_VALIDATION = previousSkipValidation;
    }
  }
});
