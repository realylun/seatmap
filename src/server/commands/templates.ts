import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { templateVersions, templates } from "@/db/schema";
import { serializeGeometry } from "@/domain/venue/geometry-json";
import { DEFAULT_EXTENT, buildVenue } from "@/domain/venue/venue-file";
import { editorBlockSchema, venueSchema } from "@/domain/venue/types";
import type { PutJson } from "../blob";
import { localBlobUrlSchema } from "./image-url";
import type { Db } from "../inventory/db";
import { invalid, type CommandResult } from "./venues";

const createTemplateSchema = z.object({
  venueId: z.uuid(),
  name: z.string().trim().min(1).max(200),
});

/** `venueJson` is an optional parsed venue.json export; only its `editor` block is kept. */
export async function createTemplate(
  db: Db,
  input: { venueId: string; name: string; venueJson?: unknown },
): Promise<CommandResult<string>> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  let editorState: z.infer<typeof editorBlockSchema> = {
    extent: DEFAULT_EXTENT,
    sections: [],
  };
  if (input.venueJson !== undefined) {
    const block = editorBlockSchema.safeParse(
      typeof input.venueJson === "object" && input.venueJson !== null
        ? (input.venueJson as { editor?: unknown }).editor
        : undefined,
    );
    if (!block.success)
      return { ok: false, error: 'venue.json has no valid "editor" block' };
    editorState = block.data;
  }
  const [row] = await db
    .insert(templates)
    .values({ ...parsed.data, editorState })
    .returning({ id: templates.id });
  return { ok: true, value: row.id };
}

export type PublishedVersion = {
  id: string;
  version: number;
  seatCount: number;
  sectionCount: number;
};

/** Builds geometry from the draft editor_state, uploads it to Blob and records an immutable version. */
export async function publishVersion(
  db: Db,
  putJson: PutJson,
  templateId: string,
): Promise<CommandResult<PublishedVersion>> {
  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, templateId));
  if (!template) return { ok: false, error: "Template not found" };
  const draft = editorBlockSchema.safeParse(template.editorState);
  if (!draft.success) return { ok: false, error: "Template draft is invalid" };
  if (draft.data.sections.length === 0)
    return { ok: false, error: "Template has no sections" };

  const venue = venueSchema.safeParse(buildVenue(draft.data));
  if (!venue.success) return invalid(venue.error);
  const seatCount = venue.data.sections.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0),
    0,
  );
  if (seatCount === 0) return { ok: false, error: "Template has no seats" };

  const [latest] = await db
    .select({ version: templateVersions.version })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const { url } = await putJson(
    `geometry/${templateId}/v${version}.json`,
    serializeGeometry(venue.data),
  );
  const sectionCount = venue.data.sections.length;
  const [row] = await db
    .insert(templateVersions)
    .values({ templateId, version, geometryUrl: url, sectionCount, seatCount })
    .returning({ id: templateVersions.id });
  return { ok: true, value: { id: row.id, version, seatCount, sectionCount } };
}

export async function saveTemplateDraft(
  db: Db,
  templateId: string,
  editor: unknown,
): Promise<CommandResult<null>> {
  const parsed = editorBlockSchema.safeParse(editor);
  if (!parsed.success) return invalid(parsed.error);
  const rows = await db
    .update(templates)
    .set({ editorState: parsed.data, updatedAt: new Date() })
    .where(eq(templates.id, templateId))
    .returning({ id: templates.id });
  return rows.length
    ? { ok: true, value: null }
    : { ok: false, error: "Template not found" };
}

export async function setTemplateBackground(
  db: Db,
  templateId: string,
  url: string | null,
): Promise<CommandResult<null>> {
  const parsed = z
    .union([z.url({ protocol: /^https?$/ }), localBlobUrlSchema])
    .nullable()
    .safeParse(url);
  if (!parsed.success) return invalid(parsed.error);
  const rows = await db
    .update(templates)
    .set({ backgroundImageUrl: parsed.data, updatedAt: new Date() })
    .where(eq(templates.id, templateId))
    .returning({ id: templates.id });
  return rows.length
    ? { ok: true, value: null }
    : { ok: false, error: "Template not found" };
}
