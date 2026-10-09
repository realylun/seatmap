import { connection } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { templateVersions, templates, venues } from "@/db/schema";

export async function listTemplates() {
  await connection();
  return getDb()
    .select({
      id: templates.id,
      name: templates.name,
      venueName: venues.name,
      updatedAt: templates.updatedAt,
    })
    .from(templates)
    .innerJoin(venues, eq(venues.id, templates.venueId))
    .orderBy(desc(templates.updatedAt));
}

export async function getTemplate(id: string) {
  await connection();
  const [row] = await getDb()
    .select()
    .from(templates)
    .where(eq(templates.id, id));
  return row ?? null;
}

export async function listTemplateVersions(templateId: string) {
  await connection();
  return getDb()
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.version));
}

/** Published versions with labels, for the event creation form. */
export async function listPublishedVersions() {
  await connection();
  return getDb()
    .select({
      id: templateVersions.id,
      version: templateVersions.version,
      seatCount: templateVersions.seatCount,
      templateName: templates.name,
      venueName: venues.name,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .innerJoin(venues, eq(venues.id, templates.venueId))
    .orderBy(
      asc(venues.name),
      asc(templates.name),
      desc(templateVersions.version),
    );
}

/** All versions of the venue's templates, newest first, for rebinding an event. */
export async function listVenueVersions(venueId: string) {
  await connection();
  return getDb()
    .select({
      id: templateVersions.id,
      version: templateVersions.version,
      sectionCount: templateVersions.sectionCount,
      templateName: templates.name,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templates.venueId, venueId))
    .orderBy(desc(templateVersions.createdAt), desc(templateVersions.version));
}
