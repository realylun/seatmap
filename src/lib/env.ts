import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

function readEnv<K extends keyof Env>(key: K): Env[K] {
  const parsed = envSchema.shape[key].safeParse(process.env[key]);
  if (!parsed.success) {
    throw new Error(`Missing or invalid environment variable ${key}`);
  }
  return parsed.data;
}

export const env = {
  get databaseUrl() {
    return readEnv("DATABASE_URL");
  },
  get blobToken() {
    return readEnv("BLOB_READ_WRITE_TOKEN");
  },
};
