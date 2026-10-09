"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  confirmOrderAction,
  type CheckoutState,
} from "@/server/actions/orders";

const INITIAL: CheckoutState = {};

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-ink aria-invalid:border-red-500";

export function CheckoutForm({
  holdId,
  eventSlug,
}: {
  holdId: string;
  eventSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    confirmOrderAction.bind(null, holdId),
    INITIAL,
  );

  if (state.closed) {
    return (
      <div
        role="alert"
        data-testid="checkout-error"
        className="rounded-lg bg-red-50 px-4 py-3 text-red-800"
      >
        <p>{state.message}</p>
        <Link
          href={`/events/${eventSlug}`}
          className="mt-2 inline-block font-semibold underline"
        >
          Back to event
        </Link>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-4">
      <div>
        <label htmlFor="buyerName" className="mb-1 block text-sm font-semibold">
          Full name
        </label>
        <input
          id="buyerName"
          data-testid="buyer-name"
          name="buyerName"
          autoComplete="name"
          defaultValue={state.values?.buyerName}
          aria-invalid={errors.buyerName ? true : undefined}
          aria-describedby={errors.buyerName ? "buyerName-error" : undefined}
          className={inputCls}
        />
        {errors.buyerName && (
          <p id="buyerName-error" className="mt-1 text-sm text-red-700">
            {errors.buyerName}
          </p>
        )}
      </div>
      <div>
        <label
          htmlFor="buyerEmail"
          className="mb-1 block text-sm font-semibold"
        >
          Email
        </label>
        <input
          id="buyerEmail"
          data-testid="buyer-email"
          name="buyerEmail"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.buyerEmail}
          aria-invalid={errors.buyerEmail ? true : undefined}
          aria-describedby={errors.buyerEmail ? "buyerEmail-error" : undefined}
          className={inputCls}
        />
        {errors.buyerEmail && (
          <p id="buyerEmail-error" className="mt-1 text-sm text-red-700">
            {errors.buyerEmail}
          </p>
        )}
      </div>
      {(state.message ?? errors.buyerName ?? errors.buyerEmail) && (
        <p
          role="alert"
          data-testid="checkout-error"
          className="text-sm text-red-700"
        >
          {state.message ?? "Please fix the highlighted fields."}
        </p>
      )}
      <button
        type="submit"
        data-testid="pay-button"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Processing…" : "Pay (simulated)"}
      </button>
    </form>
  );
}
