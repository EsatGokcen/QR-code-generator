/**
 * src/routes/registrationRouter.ts — Registration HTTP Route
 *
 * Handles POST /api/register — the form submission endpoint.
 *
 * SEPARATION OF CONCERNS:
 * This file is the HTTP layer only. Its job is to:
 *   1. Parse and validate the HTTP request
 *   2. Call the appropriate service methods
 *   3. Serialise the result as a JSON HTTP response
 *
 * Business logic lives in TicketService.
 * Data access lives in the repository.
 * Email sending lives in EmailService.
 * This router knows none of their internals — it only orchestrates.
 *
 * FACTORY FUNCTION PATTERN:
 * Rather than importing TicketService as a singleton, we receive it as a
 * parameter. This is the same dependency injection principle used throughout
 * the codebase — the router is testable without touching a real database or
 * file system, because you can pass in mocked services.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/ticketService';
import { sendTicketEmail } from '../services/emailService';
import { config } from '../config';

// ─── Request Schema ───────────────────────────────────────────────────────────

/**
 * Zod validation schema for the incoming POST body.
 *
 * `.safeParse()` returns { success, data } or { success, error } —
 * it never throws. We use it to produce a typed 400 response without
 * try/catch boilerplate. After a successful parse, TypeScript knows
 * the exact shape of `parsed.data` — no type assertions needed.
 *
 * RFC 5321 sets 254 as the maximum email address length.
 */
const registrationBodySchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Must be a valid email address')
    .max(254, 'Email is too long (max 254 characters)'),

  subscribedToMailingList: z.boolean().optional().default(false),

  attendeeName: z
    .string()
    .max(100, 'Name must be under 100 characters')
    .optional(),
});

type RegistrationBody = z.infer<typeof registrationBodySchema>;

// ─── Router ───────────────────────────────────────────────────────────────────

export function createRegistrationRouter(ticketService: TicketService): Router {
  const router = Router();

  /**
   * POST /api/register
   *
   * 1. Validate body with Zod → 400 on failure
   * 2. Create ticket + generate QR code → 500 on failure
   * 3. Send email with QR attached → 500 on failure
   * 4. Return 201 with ticketId and mode info
   *
   * We always return structured JSON (never HTML error pages) so the
   * React frontend can display user-friendly messages for every outcome.
   */
  router.post('/register', async (req: Request, res: Response) => {
    // ── Step 1: Validate ───────────────────────────────────────────────────
    const parsed = registrationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        // ZodError.flatten() produces { fieldErrors: { email: ['...'] }, formErrors: [] }
        // This shape is easy for the frontend to map directly onto form fields.
        errors: parsed.error.flatten().fieldErrors,
        message: 'Validation failed. Please check your input.',
      });
    }

    const { email, subscribedToMailingList, attendeeName }: RegistrationBody = parsed.data;

    try {
      // ── Step 2: Create ticket + QR ──────────────────────────────────────
      const { ticket, qrFilePath } = await ticketService.createTicket(
        email,
        attendeeName
      );

      // ── Step 3: Send confirmation email ─────────────────────────────────
      const emailResult = await sendTicketEmail({
        qrCodePath: qrFilePath,
        emailData: {
          attendeeName,
          attendeeEmail: ticket.attendeeEmail,
          ticketId: ticket.id,
          eventName: 'Game Summit 2026',
          eventDate: 'July 15–17, 2026 · ExCeL London',
          verifyUrl: `${config.api.baseUrl}/${config.api.version}/tickets/verify/${ticket.id}`,
        },
      });

      // Log the mailing list preference — in production, persist this
      // to a marketing platform (Mailchimp, HubSpot) via their API.
      if (subscribedToMailingList) {
        console.log(`[Registration] Mailing list opt-in: ${ticket.attendeeEmail}`);
      }

      // ── Step 4: Respond ──────────────────────────────────────────────────
      return res.status(201).json({
        success: true,
        ticketId: ticket.id,
        emailMode: emailResult.mode,
        // Tell the frontend where to find the email in demo mode
        mailtrapUrl: emailResult.mailtrapInboxUrl,
        message: `Ticket issued and sent to ${ticket.attendeeEmail}.`,
      });

    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Registration] Unhandled error:', detail);

      return res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.',
        // Only expose internal detail in non-production environments
        ...(process.env.NODE_ENV !== 'production' && { detail }),
      });
    }
  });

  return router;
}
