import { z } from "zod";
import type { CommandResult } from "../commands/venues";

export const formObject = (formData: FormData): Record<string, string> =>
  Object.fromEntries(
    [...formData.entries()].filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );

/** Admin POC: business errors surface through the admin error boundary. */
export function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export const isUuid = (value: unknown): value is string =>
  z.uuid().safeParse(value).success;

/** Redirect-style actions: reject malformed ids before touching the database. */
export function assertUuid(...ids: unknown[]): void {
  if (!ids.every(isUuid)) throw new Error("Invalid id");
}
