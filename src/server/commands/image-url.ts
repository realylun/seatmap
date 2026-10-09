import { z } from "zod";
import { isLocalBlobUrl } from "../local-blob";

/** Root-relative URL of a file under public/local-blob (local mode). */
export const localBlobUrlSchema = z
  .string()
  .refine(isLocalBlobUrl, "invalid local blob path");
