import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteVenueAction, updateVenueAction } from "@/server/actions/venues";
import { getVenue } from "@/server/queries/venues";
import {
  Field,
  Loading,
  PageHeader,
  btnCls,
  btnGhostCls,
  inputCls,
} from "../../_components/ui";

type IdParams = { params: Promise<{ id: string }> };

async function VenueForm({ params }: IdParams) {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();
  return (
    <>
      <PageHeader title={venue.name} />
      <form
        action={updateVenueAction.bind(null, id)}
        className="grid max-w-md gap-3"
      >
        <Field label="Name">
          <input
            name="name"
            defaultValue={venue.name}
            required
            className={inputCls}
          />
        </Field>
        <Field label="City">
          <input
            name="city"
            defaultValue={venue.city}
            required
            className={inputCls}
          />
        </Field>
        <Field label="Address">
          <input
            name="address"
            defaultValue={venue.address ?? ""}
            className={inputCls}
          />
        </Field>
        <div className="flex gap-2">
          <button className={btnCls}>Save</button>
          <button
            formAction={deleteVenueAction.bind(null, id)}
            className={btnGhostCls}
            formNoValidate
          >
            Delete
          </button>
        </div>
      </form>
    </>
  );
}

export default function VenuePage(props: IdParams) {
  return (
    <Suspense fallback={<Loading />}>
      <VenueForm params={props.params} />
    </Suspense>
  );
}
