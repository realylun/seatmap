"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { putJson } from "../blob";
import {
  createTemplate,
  publishVersion,
  saveTemplateDraft,
  setTemplateBackground,
} from "../commands/templates";
import type { CommandResult } from "../commands/venues";
import { assertUuid, formObject, isUuid, unwrap } from "./form";

export async function createTemplateAction(formData: FormData) {
  const file = formData.get("file");
  let venueJson: unknown;
  if (file instanceof File && file.size > 0) {
    try {
      venueJson = JSON.parse(await file.text());
    } catch (cause) {
      throw new Error("venue.json is not valid JSON", { cause });
    }
  }
  const { venueId, name } = formObject(formData);
  const id = unwrap(
    await createTemplate(getDb(), { venueId, name, venueJson }),
  );
  redirect(`/admin/templates/${id}/edit`);
}

export async function publishVersionAction(templateId: string) {
  assertUuid(templateId);
  unwrap(await publishVersion(getDb(), putJson, templateId));
  redirect(`/admin/templates/${templateId}/edit`);
}

/** Autosave: returns the error instead of throwing. */
export async function saveTemplateDraftAction(
  templateId: string,
  editor: unknown,
): Promise<CommandResult<null>> {
  if (!isUuid(templateId)) return { ok: false, error: "Invalid id" };
  try {
    return await saveTemplateDraft(getDb(), templateId, editor);
  } catch (cause) {
    console.error("saveTemplateDraft failed", cause);
    return { ok: false, error: "Could not save draft" };
  }
}

export async function setTemplateBackgroundAction(
  templateId: string,
  url: string | null,
): Promise<CommandResult<null>> {
  if (!isUuid(templateId)) return { ok: false, error: "Invalid id" };
  try {
    return await setTemplateBackground(getDb(), templateId, url);
  } catch (cause) {
    console.error("setTemplateBackground failed", cause);
    return { ok: false, error: "Could not save background" };
  }
}
