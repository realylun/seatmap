import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { putFile, putJson } from "@/server/blob";
import { isLocalBlobMode } from "@/server/local-blob";
import { env } from "@/lib/env";
import { getPoolDb } from "./client";
import type { SeedMapKey } from "./seed/data";
import { assertSeedAllowed } from "./seed/guard";
import { seedDatabase } from "./seed/seed-database";
import { venueFileFromSvg } from "./seed/svg-source";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATA_DIR = join(ROOT, "data/venues");
const VENUE_FILE: Record<SeedMapKey, string> = {
  rosetta: "venue.rosetta.json",
  sample: "venue.sample.json",
  att: "att-stadium.svg",
  trongdong: "trong-dong.svg",
};

async function uploadBackground(key: SeedMapKey, file: string) {
  const bytes = await readFile(join(DATA_DIR, file));
  const { url } = await putFile(
    `backgrounds/seed-${key}.png`,
    bytes,
    "image/png",
  );
  return url;
}

async function readVenueFile(key: SeedMapKey): Promise<unknown> {
  const file = VENUE_FILE[key];
  const text = await readFile(join(DATA_DIR, file), "utf8");
  return file.endsWith(".svg") ? venueFileFromSvg(text) : JSON.parse(text);
}

async function main() {
  assertSeedAllowed(env.databaseUrl, process.env.SEED_CONFIRM);
  const db = getPoolDb(); // thiếu DATABASE_URL → dừng trước khi upload gì
  try {
    const venueFiles = {
      rosetta: await readVenueFile("rosetta"),
      sample: await readVenueFile("sample"),
      att: await readVenueFile("att"),
      trongdong: await readVenueFile("trongdong"),
    };
    const backgroundUrls = {
      rosetta: await uploadBackground("rosetta", "rosetta-arena.png"),
      att: await uploadBackground("att", "att-stadium.png"),
      trongdong: await uploadBackground("trongdong", "trong-dong.png"),
    };
    const summary = await seedDatabase(db, {
      putJson,
      venueFiles,
      backgroundUrls,
    });
    console.info(
      `Seed xong (${isLocalBlobMode() ? "public/local-blob" : "Vercel Blob"}): ${summary.venues} venue, ` +
        `${summary.versions.length} template version, ${summary.events} event, ${summary.seats} ghế`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed thất bại:", error);
  process.exitCode = 1;
});
