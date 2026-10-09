import { Suspense } from "react";
import { listOrders } from "@/server/queries/orders";
import {
  Loading,
  PageHeader,
  Table,
  Td,
  formatDateTime,
  formatVnd,
} from "../_components/ui";

async function OrderTable() {
  const rows = await listOrders();
  return (
    <Table head={["Order", "Event", "Buyer", "Seats", "Total", "Created"]}>
      {rows.map((o) => (
        <tr key={o.id}>
          <Td>{o.id.slice(0, 8)}</Td>
          <Td>{o.eventName}</Td>
          <Td>
            {o.buyerName}
            <br />
            <span className="text-xs text-zinc-500">{o.buyerEmail}</span>
          </Td>
          <Td>{o.seats.join(", ")}</Td>
          <Td>{formatVnd(o.total)}</Td>
          <Td>{formatDateTime(o.createdAt)}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" />
      <Suspense fallback={<Loading />}>
        <OrderTable />
      </Suspense>
    </>
  );
}
