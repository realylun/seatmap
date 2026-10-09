import { Suspense } from "react";
import { createEventAction } from "@/server/actions/events";
import { listPublishedVersions } from "@/server/queries/templates";
import { ImageUpload } from "../../_components/ImageUpload";
import {
  Field,
  Loading,
  PageHeader,
  btnCls,
  inputCls,
} from "../../_components/ui";

async function NewEventForm() {
  const versions = await listPublishedVersions();
  if (versions.length === 0) {
    return <p className="text-sm">Publish a template version first.</p>;
  }
  return (
    <form action={createEventAction} className="grid max-w-xl gap-3">
      <Field label="Name">
        <input name="name" required className={inputCls} />
      </Field>
      <Field label="Slug">
        <input
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          className={inputCls}
        />
      </Field>
      <Field label="Category">
        <select name="category" className={inputCls}>
          <option value="sports">Sports</option>
          <option value="music">Music</option>
          <option value="shows">Shows</option>
        </select>
      </Field>
      <Field label="Starts at">
        <input
          type="datetime-local"
          name="startsAt"
          required
          className={inputCls}
        />
      </Field>
      <Field label="Template version">
        <select name="templateVersionId" required className={inputCls}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.venueName} / {v.templateName} v{v.version} ({v.seatCount}{" "}
              seats)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Image">
        <ImageUpload name="imageUrl" />
      </Field>
      <button className={btnCls}>Create event</button>
    </form>
  );
}

export default function NewEventPage() {
  return (
    <>
      <PageHeader title="New event" />
      <Suspense fallback={<Loading />}>
        <NewEventForm />
      </Suspense>
    </>
  );
}
