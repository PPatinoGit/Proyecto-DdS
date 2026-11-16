/*
 Request validation shared by the API handlers.

 Only the server imports this module: it depends on Zod and the browser bundle
 does not need it. Types for the browser live in src/lib/types.ts.
*/

import { z } from "zod";

/*
 Dates arrive from <input type="datetime-local"> as "YYYY-MM-DDTHH:mm", so they
 have no timezone. Date.parse() reads them as local time, which is what the
 admin sees in the form. The API stores the ISO version in UTC.
*/
const dateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "invalid_date" });

export const electionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    opensAt: dateString.nullable(),
    closesAt: dateString.nullable(),
  })
  .refine(
    ({ opensAt, closesAt }) =>
      opensAt === null || closesAt === null || Date.parse(closesAt) > Date.parse(opensAt),
    { message: "invalid_range", path: ["closesAt"] },
  );

export type ElectionInputPayload = z.infer<typeof electionInputSchema>;
