import Link from "next/link";
import { Suspense } from "react";
import { createTemplateAction } from "@/server/actions/templates";
import { listTemplates } from "@/server/queries/templates";
import { listVenues } from "@/server/queries/venues";
import {
  Field,
  Loading,
  PageHeader,
  Table,
  Td,
  btnCls,
  formatDateTime,
  inputCls,
  linkCls,
} from "../_components/ui";

async function CreateForm() {
  const venues = await listVenues();
  return (
    <form
      action={createTemplateAction}
      className="mb-8 grid max-w-2xl grid-cols-2 items-end gap-3"
    >
      <Field label="Venue">
        <select name="venueId" required className={inputCls}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.city})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input name="name" required className={inputCls} />
      </Field>
      <Field label="Import venue.json (optional)">
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          className={inputCls}
        />
      </Field>
      <button className={btnCls}>Create template</button>
    </form>
  );
}

async function TemplateTable() {
  const rows = await listTemplates();
  return (
    <Table head={["Name", "Venue", "Updated", ""]}>
      {rows.map((t) => (
        <tr key={t.id}>
          <Td>{t.name}</Td>
          <Td>{t.venueName}</Td>
          <Td>{formatDateTime(t.updatedAt)}</Td>
          <Td>
            <Link className={linkCls} href={`/admin/templates/${t.id}/edit`}>
              Open
            </Link>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" />
      <Suspense fallback={<Loading />}>
        <CreateForm />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <TemplateTable />
      </Suspense>
    </>
  );
}
