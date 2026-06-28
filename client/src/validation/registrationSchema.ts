/**
 * client/src/validation/registrationSchema.ts — Form Validation
 *
 * Zod schema for the registration form fields.
 *
 * WHY ZOD OVER MANUAL VALIDATION?
 * Zod schemas are composable, reusable, and produce TypeScript types automatically.
 * `z.infer<typeof registrationSchema>` gives you the exact typed shape —
 * no separate interface needed. You write the schema once; the type is derived.
 *
 * The same schema is used in two ways:
 * 1. `safeParse()` on submit — full validation, returns all errors
 * 2. `shape.email.safeParse(value)` on blur — validate a single field live
 *
 * For server-side validation, see src/routes/registrationRouter.ts which has
 * a parallel Zod schema (the two are intentionally separate — the server
 * is the authoritative validator; the client schema provides UX feedback only).
 */

import { z } from 'zod';

export const registrationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Enter a valid email address (e.g. alex@example.com)')
    .max(254, 'Email address is too long'),

  subscribedToMailingList: z.boolean(),
});

/** Derived TypeScript type — no duplication needed */
export type RegistrationFormData = z.infer<typeof registrationSchema>;

/**
 * Validates a single email string and returns an error message or null.
 * Used for real-time field-level feedback on blur.
 */
export function validateEmailField(value: string): string | null {
  const result = registrationSchema.shape.email.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}
