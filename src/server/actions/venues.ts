"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createVenue, deleteVenue, updateVenue } from "../commands/venues";
import { formObject, unwrap, assertUuid } from "./form";

export async function createVenueAction(formData: FormData) {
  const id = unwrap(await createVenue(getDb(), formObject(formData)));
  redirect(`/admin/venues/${id}`);
}

export async function updateVenueAction(id: string, formData: FormData) {
  assertUuid(id);
  unwrap(await updateVenue(getDb(), id, formObject(formData)));
  redirect("/admin/venues");
}

export async function deleteVenueAction(id: string) {
  assertUuid(id);
  unwrap(await deleteVenue(getDb(), id));
  redirect("/admin/venues");
}
