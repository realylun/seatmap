"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getPoolDb } from "@/db/client";
import { readSessionId } from "@/lib/session";
import { confirmOrder, type ConfirmOrderResult } from "../inventory/orders";

export type CheckoutState = {
  message?: string;
  /** Hold không còn dùng được → ẩn form, chỉ còn link quay lại event */
  closed?: boolean;
  fieldErrors?: { buyerName?: string; buyerEmail?: string };
  values?: { buyerName: string; buyerEmail: string };
};

const buyerSchema = z.object({
  buyerName: z
    .string()
    .trim()
    .min(1, "Please enter your name.")
    .max(200, "Name is too long."),
  buyerEmail: z.email("Please enter a valid email address."),
});

type FailReason = Extract<ConfirmOrderResult, { ok: false }>["reason"];

const FAIL_MESSAGES: Record<FailReason, string> = {
  INVALID_INPUT: "Please check your details.",
  HOLD_NOT_FOUND: "This hold does not exist.",
  NOT_OWNER: "This hold belongs to another session.",
  HOLD_EXPIRED: "Your hold has expired. Please choose seats again.",
  HOLD_NOT_ACTIVE: "This hold is no longer active.",
  SEATS_LOST: "Your seats are no longer held. Please choose seats again.",
};

const readField = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Thanh toán giả lập: validate người mua → confirmOrder (transaction) → /orders/[id] */
export async function confirmOrderAction(
  holdId: string,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const values = {
    buyerName: readField(formData, "buyerName"),
    buyerEmail: readField(formData, "buyerEmail"),
  };
  const parsed = buyerSchema.safeParse(values);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      values,
      fieldErrors: {
        buyerName: errors.buyerName?.[0],
        buyerEmail: errors.buyerEmail?.[0],
      },
    };
  }
  const sessionId = await readSessionId();
  if (!sessionId)
    return { values, closed: true, message: FAIL_MESSAGES.NOT_OWNER };

  let orderId: string;
  try {
    const result = await confirmOrder(getPoolDb(), {
      holdId,
      sessionId,
      ...parsed.data,
    });
    if (!result.ok) {
      return {
        values,
        closed: result.reason !== "INVALID_INPUT",
        message: FAIL_MESSAGES[result.reason],
      };
    }
    orderId = result.order.id;
  } catch (error) {
    console.error("confirmOrderAction failed", { holdId, error });
    return {
      values,
      message: "Payment could not be completed. Please try again.",
    };
  }
  redirect(`/orders/${orderId}`);
}
