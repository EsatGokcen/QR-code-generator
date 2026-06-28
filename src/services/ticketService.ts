/**
 * src/services/ticketService.ts — Ticket Business Logic
 *
 * This is the "brain" of the ticketing system. It orchestrates:
 * - Ticket creation (including triggering QR code generation)
 * - Ticket verification / scanning at event entry points
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  SOLID PRINCIPLES APPLIED HERE                                          │
 * │                                                                         │
 * │  S — Single Responsibility: this class only handles ticket business     │
 * │      logic. Image generation is in qrService; data access is in the    │
 * │      repository. Each has one reason to change.                         │
 * │                                                                         │
 * │  O — Open/Closed: new ticket states (e.g. TRANSFERRED) can be added    │
 * │      to the TicketStatus enum and handled in verifyTicket without       │
 * │      modifying the existing branches.                                   │
 * │                                                                         │
 * │  D — Dependency Inversion: this class depends on ITicketRepository      │
 * │      (an interface / abstraction), not InMemoryTicketRepository (a      │
 * │      concrete implementation). The concrete class is injected from      │
 * │      outside (see index.ts). This is constructor injection.            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import {
  ITicketRepository,
  Ticket,
  TicketStatus,
  TicketVerificationResult,
  TicketErrorCode,
  TicketQrOptions,
} from '../types';
import { generateTicketQr } from './qrService';

export class TicketService {
  /**
   * The repository is injected via the constructor — not created here.
   *
   * `private readonly` means:
   * - `private`  → nothing outside this class can call repository methods directly
   * - `readonly`  → the repository reference cannot be reassigned after construction
   *
   * This enforces encapsulation: the only way to interact with ticket data
   * is through the public methods of TicketService, which apply business rules.
   */
  private readonly repository: ITicketRepository;

  /**
   * Constructor injection.
   *
   * The caller decides WHICH repository implementation to use:
   *   // Prototype / tests:
   *   const svc = new TicketService(new InMemoryTicketRepository());
   *
   *   // Production:
   *   const svc = new TicketService(new PostgresTicketRepository(pgClient));
   *
   * TicketService never needs to know or care which one it received.
   */
  constructor(repository: ITicketRepository) {
    this.repository = repository;
  }

  // ── Public Methods ──────────────────────────────────────────────────────────

  /**
   * Creates a new ticket for a registered attendee and generates its QR code.
   *
   * FLOW:
   * 1. Validate the email address (basic format check at the service boundary)
   * 2. Persist a new ACTIVE ticket via the repository (gets its unique ID here)
   * 3. Generate a QR code PNG that encodes the ticket's verification URL
   * 4. Return the ticket entity plus QR output paths for the caller to use
   *    (e.g., to send the QR via email, or store the file URL on the ticket)
   *
   * WHY VALIDATE EMAIL HERE AND NOT IN THE REPOSITORY?
   * The repository is a pure data layer — it should not know what constitutes
   * a "valid" email for this business domain. Validation belongs in the service
   * layer, which owns business rules. A more complete implementation would use
   * a proper email validation library (e.g., `validator.js`).
   *
   * @param attendeeEmail - The registrant's email address (required)
   * @param attendeeName  - The registrant's display name (optional)
   * @param qrOptions     - QR appearance overrides (optional)
   * @returns             The new Ticket entity and QR output details
   */
  async createTicket(
    attendeeEmail: string,
    attendeeName?: string,
    qrOptions?: TicketQrOptions
  ): Promise<{ ticket: Ticket; qrFilePath: string; qrDataUrl: string }> {
    // Input validation: catch bad data before it reaches the repository
    if (!attendeeEmail || !attendeeEmail.includes('@')) {
      throw new Error(
        `Invalid email address: "${attendeeEmail}". ` +
        `A valid email is required to issue a ticket.`
      );
    }

    // Step 1: Persist the ticket. The repository generates the UUID and
    // sets createdAt. The ticket starts in ACTIVE status.
    const ticket = await this.repository.create({
      attendeeEmail: attendeeEmail.trim().toLowerCase(), // Normalise for consistency
      attendeeName: attendeeName?.trim(),
      status: TicketStatus.ACTIVE,
    });

    // Step 2: Generate the unique QR code image for this ticket.
    // The QR encodes the full verification URL including ticket.id.
    const qrResult = await generateTicketQr(ticket.id, {
      outputFilename: `ticket-${ticket.id}`,
      ...qrOptions,
    });

    // PRODUCTION EXTENSION POINT:
    // Here you would typically:
    // a) Upload qrResult.filePath to S3 → get back a public URL
    // b) Store that URL on the ticket: await this.repository.updateQrUrl(ticket.id, s3Url)
    // c) Trigger an email to ticket.attendeeEmail with the QR attached
    //    (this would be another injected service: EmailService)

    return {
      ticket,
      qrFilePath: qrResult.filePath,
      qrDataUrl: qrResult.dataUrl,
    };
  }

  /**
   * Verifies a ticket scan and marks it as used if valid.
   *
   * This is the CORE SECURITY FUNCTION of the entire system.
   * It is called every time a physical scanner reads a ticket QR at the entry gate.
   *
   * REQUIREMENTS:
   * - Fast: called in real time while an attendee stands at the gate
   * - Clear: error messages must be unambiguous for non-technical gate staff
   * - Secure: a scanned ticket MUST NOT be re-usable
   *
   * ⚠️  RACE CONDITION WARNING (for future DB implementation):
   * In this in-memory prototype, "check status → update status" is two steps.
   * With a single Node.js process and no true concurrency, this is safe.
   * In production with multiple scanner terminals hitting a shared database:
   *
   *   ❌ UNSAFE (two separate queries — race window between them):
   *      SELECT status FROM tickets WHERE id = $1;  -- both scanners see ACTIVE
   *      UPDATE tickets SET status='SCANNED' WHERE id = $1;  -- both succeed!
   *
   *   ✅ SAFE (one atomic query — database-level mutual exclusion):
   *      UPDATE tickets SET status='SCANNED', scanned_at=NOW()
   *      WHERE id = $1 AND status = 'ACTIVE'
   *      RETURNING *;
   *      -- Only one of the concurrent requests gets a row back.
   *      -- The other gets 0 rows and knows to reject.
   *
   * @param ticketId - The UUID extracted from the scanned QR code URL
   * @returns        TicketVerificationResult — always returns a result, never throws
   */
  async verifyTicket(ticketId: string): Promise<TicketVerificationResult> {
    // Guard 1: Basic format validation — catches malformed/empty strings
    // before making any database calls.
    if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
      return {
        success: false,
        errorCode: TicketErrorCode.INVALID_FORMAT,
        message: 'Invalid ticket ID. Please scan a valid QR code.',
      };
    }

    // Guard 2: Look up the ticket in the repository
    const ticket = await this.repository.findById(ticketId.trim());

    if (!ticket) {
      return {
        success: false,
        errorCode: TicketErrorCode.NOT_FOUND,
        message: `Ticket not found: "${ticketId}". This QR code is not recognised.`,
      };
    }

    // Core verification logic: branch on the ticket's current status.
    // Using a switch/exhaustive check ensures every TicketStatus value is handled.
    switch (ticket.status) {
      case TicketStatus.ACTIVE: {
        // ✅ HAPPY PATH — first scan of a valid ticket
        const scannedAt = new Date();
        const updatedTicket = await this.repository.updateStatus(
          ticket.id,
          TicketStatus.SCANNED,
          scannedAt
        );

        return {
          success: true,
          // Use updatedTicket if available; fall back to original (shouldn't happen)
          ticket: updatedTicket ?? ticket,
          message:
            `✓ ENTRY GRANTED — Welcome${ticket.attendeeName ? `, ${ticket.attendeeName}` : ''}! ` +
            `Ticket for ${ticket.attendeeEmail} is valid.`,
        };
      }

      case TicketStatus.SCANNED: {
        // ❌ DUPLICATE SCAN — most critical fraud case
        // Return the ticket so staff can see WHEN it was first scanned,
        // which helps identify fraudulent sharing vs. genuine double-taps.
        return {
          success: false,
          ticket, // Include full ticket so staff can see scannedAt timestamp
          errorCode: TicketErrorCode.ALREADY_SCANNED,
          message:
            `✗ DENIED — This ticket was already scanned at ` +
            `${ticket.scannedAt?.toLocaleString() ?? 'unknown time'}. ` +
            `Possible duplicate or fraudulent QR.`,
        };
      }

      case TicketStatus.CANCELLED: {
        return {
          success: false,
          ticket,
          errorCode: TicketErrorCode.CANCELLED,
          message: '✗ DENIED — This ticket has been cancelled.',
        };
      }

      case TicketStatus.EXPIRED: {
        return {
          success: false,
          ticket,
          errorCode: TicketErrorCode.EXPIRED,
          message: '✗ DENIED — This ticket has expired.',
        };
      }

      default: {
        /**
         * EXHAUSTIVENESS CHECK — a TypeScript compile-time safety net.
         *
         * If a new value is added to TicketStatus (e.g. TRANSFERRED) but this
         * switch statement isn't updated, TypeScript will assign `ticket.status`
         * to type `never` here, causing a COMPILE ERROR.
         *
         * This forces developers to explicitly handle every new status,
         * preventing silent bugs where an unhandled state lets someone through.
         */
        const _exhaustive: never = ticket.status;
        return {
          success: false,
          message: `Unknown ticket status: ${String(_exhaustive)}. Contact system administrator.`,
        };
      }
    }
  }

  /**
   * Returns all tickets in the system.
   * Intended for admin dashboards, audit logs, and debugging.
   * In production, add filtering and pagination parameters.
   */
  async getAllTickets(): Promise<Ticket[]> {
    return this.repository.findAll();
  }
}
