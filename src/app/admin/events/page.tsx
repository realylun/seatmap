import Link from "next/link";
import { Suspense } from "react";
import { listEvents } from "@/server/queries/events";
import {
  Loading,
  PageHeader,
  Table,
  Td,
  btnCls,
  formatDateTime,
  linkCls,
} from "../_components/ui";

async function EventTable() {
  const rows = await listEvents();
  return (
    <Table head={["Name", "Venue", "Category", "Starts", "Status", ""]}>
      {rows.map((e) => (
        <tr key={e.id}>
          <Td>
            {e.name} {e.isTrending && <span title="Trending">🔥</span>}
          </Td>
          <Td>{e.venueName}</Td>
          <Td>{e.category}</Td>
          <Td>{formatDateTime(e.startsAt)}</Td>
          <Td>{e.status}</Td>
          <Td>
            <Link className={linkCls} href={`/admin/events/${e.id}`}>
              Manage
            </Link>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export default function EventsPage() {
  return (
    <>
      <PageHeader title="Events">
        <Link href="/admin/events/new" className={btnCls}>
          New event
        </Link>
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <EventTable />
      </Suspense>
    </>
  );
}
