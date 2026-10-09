import { eq } from "drizzle-orm";
import { z } from "zod";
import { venues } from "@/db/schema";
import type { Db } from "../inventory/db";

export const venueInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  address: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const invalid = (e: z.ZodError): { ok: false; error: string } => ({
  ok: false,
  error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
});

export { invalid };

export async function createVenue(
  db: Db,
  input: unknown,
): Promise<CommandResult<string>> {
  const parsed = venueInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [row] = await db
    .insert(venues)
    .values(parsed.data)
    .returning({ id: venues.id });
  return { ok: true, value: row.id };
}

export async function updateVenue(
  db: Db,
  id: string,
  input: unknown,
): Promise<CommandResult<string>> {
  const parsed = venueInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const rows = await db
    .update(venues)
    .set({ ...parsed.data, address: parsed.data.address ?? null })
    .where(eq(venues.id, id))
    .returning({ id: venues.id });
  return rows.length
    ? { ok: true, value: id }
    : { ok: false, error: "Venue not found" };
}

export async function deleteVenue(
  db: Db,
  id: string,
): Promise<CommandResult<string>> {
  try {
    await db.delete(venues).where(eq(venues.id, id));
    return { ok: true, value: id };
  } catch (cause) {
    console.error("deleteVenue failed", cause);
    return { ok: false, error: "Venue is still used by templates or events" };
  }
}
