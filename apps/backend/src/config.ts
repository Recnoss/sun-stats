import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const dotenvCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(repoRoot, ".env")
];
const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().min(1).optional());
const envBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

for (const dotenvPath of dotenvCandidates) {
  if (fs.existsSync(dotenvPath)) {
    dotenv.config({ path: dotenvPath, override: false });
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  TIBBER_ACCESS_TOKEN: z.string().min(1),
  SOLARMAN_ENABLED: envBoolean.default(true),
  SOLARMAN_APP_ID: optionalNonEmptyString,
  SOLARMAN_APP_SECRET: optionalNonEmptyString,
  SOLARMAN_EMAIL: optionalNonEmptyString,
  SOLARMAN_PASSWORD: optionalNonEmptyString,
  SOLARMAN_PLANT_ID: optionalNonEmptyString,
  SOLARMAN_DEVICE_SN: optionalNonEmptyString,
  SOLARMAN_BASE_URL: z.string().url().default("https://globalapi.solarmanpv.com"),
  SOLARMAN_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(5_000),
  SOLAR_STALE_AFTER_MS: z.coerce.number().default(90_000),
  GRID_STALE_AFTER_MS: z.coerce.number().default(30_000),
  TZ: z.string().default("Europe/Oslo")
}).superRefine((env, ctx) => {
  if (!env.SOLARMAN_ENABLED) {
    return;
  }

  for (const field of ["SOLARMAN_APP_ID", "SOLARMAN_APP_SECRET", "SOLARMAN_EMAIL", "SOLARMAN_PASSWORD"] as const) {
    if (!env[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Required when SOLARMAN_ENABLED=true`
      });
    }
  }
});

export type AppConfig = z.infer<typeof envSchema>;
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  const searched = dotenvCandidates.join(", ");
  throw new Error(
    `Missing required environment variables: ${missing}. Checked .env locations: ${searched}`
  );
}

export const config = parsed.data;
