/**
 * src/routes/registrationRouter.ts — Registration HTTP Route
 *
 * Handles POST /api/register — the form submission endpoint.
 *
 * ERROR ISOLATION STRATEGY:
 * Ticket creation and email delivery are in completely separate try/catch blocks.
 * This serves two purposes:
 *
 * 1. INDEPENDENT FAILURE MODES:
 *    A ticket can be created even if email delivery fails (e.g. wrong Mailtrap
 *    credentials). Operationally these are different problems needing different
 *    error messages.
 *
 * 2. CRASH PREVENTION:
 *    Any exception — including async SMTP errors from nodemailer — is caught at
 *    the nearest possible boundary and converted into a structured JSON response.
 *    Nothing propagates past this file as an unhandled rejection.
 *
 * The full internal error stack is always logged to the terminal so you can
 * diagnose failures without exposing internals to the browser.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/ticketService';
import { sendTicketEmail } from '../services/emailService';
import { config } from '../config';

// ─── Request Schema ───────────────────────────────────────────────────────────

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
   * Three stages, each with its own error boundary:
   *
   * ┌───────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
   * │ 1. Zod validate   │ → │ 2. Create ticket + QR │ → │ 3. Send email        │
   * │    400 on failure │   │    500 on failure      │   │    500 on failure    │
   * └───────────────────┘   └──────────────────────┘   │    (specific message) │
   *                                                      └──────────────────────┘
   *
   * All errors are caught, logged in full, and returned as structured JSON.
   * The server never crashes regardless of what any stage throws.
   */
  router.post('/register', async (req: Request, res: Response) => {

    // ── Stage 1: Validate ────────────────────────────────────────────────────
    const parsed = registrationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        errors: parsed.error.flatten().fieldErrors,
        message: 'Validation failed. Please check your input.',
      });
    }

    const { email, subscribedToMailingList, attendeeName }: RegistrationBody = parsed.data;

    // ── Stage 2: Create ticket + QR image ────────────────────────────────────
    //
    // Isolated in its own try/catch. If this fails (e.g. disk full, corrupt
    // jimp install), we return a generic 500 and stop immediately. There's
    // no ticket ID to proceed with, so we cannot attempt email either.
    let ticket: Awaited<ReturnType<typeof ticketService.createTicket>>['ticket'];
    let qrFilePath: string;

    try {
      const result = await ticketService.createTicket(email, attendeeName);
      ticket    = result.ticket;
      qrFilePath = result.qrFilePath;
    } catch (ticketErr: unknown) {
      // Log the full internal stack — visible in your terminal, not the browser
      console.error('[Registration] ✗ Ticket creation failed — full stack:');
      if (ticketErr instanceof Error) {
        console.error(ticketErr.stack ?? ticketErr.message);
      } else {
        console.error(ticketErr);
      }

      return res.status(500).json({
        success: false,
        message: 'Ticket creation failed. Please try again.',
        // Only expose the detail string in non-production — never in production
        ...(process.env.NODE_ENV !== 'production' && {
          detail: ticketErr instanceof Error ? ticketErr.message : String(ticketErr),
        }),
      });
    }

    // ── Stage 3: Send confirmation email via Mailtrap ────────────────────────
    //
    // Isolated from Stage 2. A Mailtrap failure (wrong credentials, network
    // timeout, SMTP auth rejection) returns a specific error message that tells
    // the user exactly what went wrong without crashing the server.
    //
    // HOW CRASHES ARE PREVENTED:
    // Nodemailer's TCP socket can emit 'error' events during cleanup, AFTER the
    // sendMail() promise has already resolved/rejected. Without our process-level
    // uncaughtException handler (server.ts) and these timeouts (emailService.ts),
    // those events would kill the Node process. Together they ensure all SMTP
    // errors surface as promise rejections that this try/catch can handle.
    try {
      const emailResult = await sendTicketEmail({
        qrCodePath: qrFilePath,
        emailData: {
          attendeeName,
          attendeeEmail: ticket.attendeeEmail,
          ticketId:      ticket.id,
          eventName:     'Game Summit 2026',
          eventDate:     'July 15–17, 2026 · ExCeL London',
          verifyUrl:     `${config.api.baseUrl}/${config.api.version}/tickets/verify/${ticket.id}`,
        },
      });

      if (subscribedToMailingList) {
        // In production: call your marketing platform (Mailchimp, HubSpot) here
        console.log(`[Registration] Mailing list opt-in: ${ticket.attendeeEmail}`);
      }

      return res.status(201).json({
        success: true,
        ticketId:    ticket.id,
        emailMode:   emailResult.mode,
        mailtrapUrl: emailResult.mailtrapInboxUrl,
        message:     `Ticket issued and confirmation sent to ${ticket.attendeeEmail}.`,
      });

    } catch (emailErr: unknown) {
      // ── Log the FULL stack to the terminal ──────────────────────────────
      // The terminal log is where you diagnose what went wrong with Mailtrap.
      // The browser only sees the clean message below.
      console.error('[Registration] ✗ Email delivery failed via Mailtrap — full stack:');
      if (emailErr instanceof Error) {
        console.error(emailErr.stack ?? emailErr.message);
      } else {
        console.error(String(emailErr));
      }

      // ── Return the specific message the user requested ─────────────────
      return res.status(500).json({
        success: false,
        message: 'Email delivery failed via Mailtrap Sandbox.',
      });
    }
  });

  return router;
}
