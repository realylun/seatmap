import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { venues } from "@/db/schema";
import { getDb } from "@/db/client";

export async function listVenues() {
  await connection();
  return getDb().select().from(venues).orderBy(asc(venues.name));
}

export async function getVenue(id: string) {
  await connection();
  const [row] = await getDb().select().from(venues).where(eq(venues.id, id));
  return row ?? null;
}
