// The body of POST /api/enrich, as documented in CLAUDE.md. Optional fields also accept null,
// because that is how Salesforce reports an empty field; null is treated as absent.

import { z } from "zod";

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

export const enrichRequestSchema = z.strictObject({
  lead: z.strictObject({
    id: z.string().trim().min(1),
    firstName: z.string(),
    lastName: z.string().trim().min(1),
    company: z.string().trim().min(1),
    email: z.email(),
    title: optionalText,
    website: optionalText,
  }),
  websiteUrl: optionalText,
  websiteText: optionalText,
});

export type EnrichRequest = z.infer<typeof enrichRequestSchema>;
