/**
 * client/src/types/index.ts — Frontend Type Definitions
 *
 * Types for API communication and component state.
 * Keeping these in one file makes it easy to update when the API contract changes.
 */

/** Shape of the JSON body we POST to /api/register */
export interface RegistrationPayload {
  email: string;
  subscribedToMailingList: boolean;
  attendeeName?: string;
}

/** Shape of the JSON response from POST /api/register on success */
export interface RegistrationSuccessResponse {
  success: true;
  ticketId: string;
  emailMode: 'demo' | 'production';
  mailtrapUrl: string;
  message: string;
}

/** Shape of the JSON response from POST /api/register on failure */
export interface RegistrationErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>; // Field-level validation errors from Zod
  detail?: string;                   // Internal error detail (dev mode only)
}

export type RegistrationResponse = RegistrationSuccessResponse | RegistrationErrorResponse;

/**
 * Discriminated union for the form's submission lifecycle.
 *
 * WHY A DISCRIMINATED UNION?
 * With a single `status` field acting as the discriminant, TypeScript narrows
 * the type automatically in switch statements and if-checks. You can't access
 * `ticketId` unless you've checked `status === 'success'` first —
 * the type system enforces correct state handling at compile time.
 */
export type SubmissionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; ticketId: string; email: string; emailMode: 'demo' | 'production'; mailtrapUrl: string }
  | { status: 'error'; message: string };
