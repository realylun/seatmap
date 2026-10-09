import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SeatAssignPanel } from "@/features/event-admin/SeatAssignPanel";
import {
  advanceStatusAction,
  rebindVersionAction,
  setTrendingAction,
} from "@/server/actions/events";
import {
  assignSectionsAction,
  blockSectionsAction,
  createTierAction,
  deleteTierAction,
  updateTierAction,
} from "@/server/actions/tiers";
import { getAdminEvent } from "@/server/queries/events";
import { listVenueVersions } from "@/server/queries/templates";
import {
  Field,
  Loading,
  PageHeader,
  Table,
  Td,
  btnCls,
  btnGhostCls,
  formatDateTime,
  formatVnd,
  inputCls,
} from "../../_components/ui";

const NEXT_LABEL = {
  draft: "Put on sale",
  on_sale: "End event",
  ended: null,
} as const;

type Data = NonNullable<Awaited<ReturnType<typeof getAdminEvent>>>;

function TierSection({ data }: { data: Data }) {
  const { event, tiers, counts } = data;
  const seatsOf = (tierId: string | null) =>
    counts.filter((c) => c.tierId === tierId).reduce((n, c) => n + c.count, 0);
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-medium">Price tiers</h2>
      <Table head={["Name", "Price (VND)", "Color", "Seats", ""]}>
        {tiers.map((t) => (
          <tr key={t.id}>
            <Td>
              <form
                id={`tier-${t.id}`}
                action={updateTierAction.bind(null, event.id, t.id)}
              >
                <input
                  name="name"
                  defaultValue={t.name}
                  required
                  className={inputCls}
                />
              </form>
            </Td>
            <Td>
              <input
                form={`tier-${t.id}`}
                name="price"
                type="number"
                min={0}
                defaultValue={t.price}
                className={inputCls}
              />
            </Td>
            <Td>
              <input
                form={`tier-${t.id}`}
                name="color"
                type="color"
                defaultValue={t.color}
              />
            </Td>
            <Td>{seatsOf(t.id)}</Td>
            <Td>
              <div className="flex gap-2">
                <button form={`tier-${t.id}`} className={btnGhostCls}>
                  Save ({formatVnd(t.price)})
                </button>
                <button
                  formAction={deleteTierAction.bind(null, event.id, t.id)}
                  form={`tier-${t.id}`}
                  className={btnGhostCls}
                  formNoValidate
                >
                  Delete
                </button>
              </div>
            </Td>
          </tr>
        ))}
        <tr>
          <Td>Unassigned</Td>
          <Td>-</Td>
          <Td>-</Td>
          <Td>{seatsOf(null)}</Td>
          <Td>-</Td>
        </tr>
      </Table>
      <form
        action={createTierAction.bind(null, event.id)}
        className="mt-3 flex max-w-2xl items-end gap-3"
      >
        <Field label="Name">
          <input name="name" required className={inputCls} />
        </Field>
        <Field label="Price (VND)">
          <input
            name="price"
            type="number"
            min={0}
            required
            className={inputCls}
          />
        </Field>
        <Field label="Color">
          <input name="color" type="color" defaultValue="#3b82f6" />
        </Field>
        <button className={btnCls}>Add tier</button>
      </form>
    </section>
  );
}

function SectionAssign({ data }: { data: Data }) {
  const { event, tiers } = data;
  return (
    <section className="mb-8 max-w-xl">
      <h2 className="mb-2 text-lg font-medium">
        Assign by section (form fallback)
      </h2>
      <form
        action={assignSectionsAction.bind(null, event.id)}
        className="mb-4 grid gap-3"
      >
        <Field label="Section ids (comma or space separated)">
          <textarea name="sections" required rows={2} className={inputCls} />
        </Field>
        <Field label="Tier">
          <select name="tierId" className={inputCls}>
            <option value="">(clear tier)</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <button className={btnCls}>Apply tier</button>
      </form>
      <form className="grid gap-3">
        <Field label="Block / unblock sections">
          <textarea name="sections" required rows={2} className={inputCls} />
        </Field>
        <div className="flex gap-2">
          <button
            formAction={blockSectionsAction.bind(null, event.id, true)}
            className={btnGhostCls}
          >
            Block
          </button>
          <button
            formAction={blockSectionsAction.bind(null, event.id, false)}
            className={btnGhostCls}
          >
            Unblock
          </button>
        </div>
      </form>
    </section>
  );
}

type Versions = Awaited<ReturnType<typeof listVenueVersions>>;

function VersionSection({
  data,
  versions,
}: {
  data: Data;
  versions: Versions;
}) {
  const { event } = data;
  const label = (v: Versions[number]) =>
    `${v.templateName} v${v.version} — ${v.sectionCount} sections`;
  const current = versions.find((v) => v.id === event.templateVersionId);
  const others = versions.filter((v) => v.id !== event.templateVersionId);
  return (
    <section className="mb-8 max-w-xl">
      <h2 className="mb-2 text-lg font-medium">Template version</h2>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Current: <b>{current ? label(current) : event.templateVersionId}</b>
      </p>
      {others.length > 0 && (
        <form
          action={rebindVersionAction.bind(null, event.id)}
          className="grid gap-3"
        >
          <Field label="Switch to version">
            <select name="templateVersionId" required className={inputCls}>
              {others.map((v) => (
                <option key={v.id} value={v.id}>
                  {label(v)}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Only allowed before any hold or order. Seats are re-created from the
            new geometry and all tier assignments are reset.
          </p>
          <button className={btnGhostCls}>Change version</button>
        </form>
      )}
    </section>
  );
}

type IdParams = { params: Promise<{ id: string }> };

async function EventAdmin({ params }: IdParams) {
  const { id } = await params;
  const data = await getAdminEvent(id);
  if (!data) notFound();
  const { event } = data;
  const versions = await listVenueVersions(event.venueId);
  const nextLabel = NEXT_LABEL[event.status];
  return (
    <>
      <PageHeader title={event.name}>
        {nextLabel && (
          <form action={advanceStatusAction.bind(null, id)}>
            <button className={btnCls}>{nextLabel}</button>
          </form>
        )}
        <form action={setTrendingAction.bind(null, id, !event.isTrending)}>
          <button className={btnGhostCls}>
            {event.isTrending ? "Remove from trending" : "Mark trending"}
          </button>
        </form>
      </PageHeader>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        /{event.slug} · {event.category} · {formatDateTime(event.startsAt)} ·
        status: <b>{event.status}</b>
      </p>
      <VersionSection data={data} versions={versions} />
      <TierSection data={data} />
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Assign on map</h2>
        <SeatAssignPanel
          eventId={id}
          geometryUrl={data.geometryUrl}
          tiers={data.tiers}
        />
      </section>
      <SectionAssign data={data} />
    </>
  );
}

export default function EventAdminPage(props: IdParams) {
  return (
    <Suspense fallback={<Loading />}>
      <EventAdmin params={props.params} />
    </Suspense>
  );
}
