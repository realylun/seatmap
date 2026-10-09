import Link from "next/link";
import { Suspense } from "react";
import { createVenueAction } from "@/server/actions/venues";
import { listVenues } from "@/server/queries/venues";
import {
  Field,
  Loading,
  PageHeader,
  Table,
  Td,
  btnCls,
  inputCls,
  linkCls,
} from "../_components/ui";

async function VenueTable() {
  const rows = await listVenues();
  return (
    <Table head={["Name", "City", "Address", ""]}>
      {rows.map((v) => (
        <tr key={v.id}>
          <Td>{v.name}</Td>
          <Td>{v.city}</Td>
          <Td>{v.address}</Td>
          <Td>
            <Link className={linkCls} href={`/admin/venues/${v.id}`}>
              Edit
            </Link>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export default function VenuesPage() {
  return (
    <>
      <PageHeader title="Venues" />
      <form
        action={createVenueAction}
        className="mb-8 grid max-w-2xl grid-cols-3 items-end gap-3"
      >
        <Field label="Name">
          <input name="name" required className={inputCls} />
        </Field>
        <Field label="City">
          <input name="city" required className={inputCls} />
        </Field>
        <Field label="Address">
          <input name="address" className={inputCls} />
        </Field>
        <button className={btnCls}>Create venue</button>
      </form>
      <Suspense fallback={<Loading />}>
        <VenueTable />
      </Suspense>
    </>
  );
}
