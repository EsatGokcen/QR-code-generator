/**
 * src/types/index.ts — Shared Type Definitions
 *
 * All TypeScript interfaces, enums, and type aliases used across the service
 * are defined here in one place. This prevents circular imports and makes it
 * easy to find the "shape" of any piece of data in the system.
 *
 * SOLID principle applied: Interface Segregation (ISP) — the ITicketRepository
 * interface defines only the methods the service actually needs. If a new
 * consumer needs different access patterns, define a new interface rather than
 * bloating this one.
 */

// ─── Ticket Entity ────────────────────────────────────────────────────────────

/**
 * All possible states a ticket can be in throughout its lifecycle.
 * Using an enum (rather than plain strings) gives us:
 * - Autocomplete in IDEs
 * - Compile-time errors if you typo a status value
 * - A single source of truth for valid states
 */
export enum TicketStatus {
  ACTIVE = 'ACTIVE',       // Issued, valid, not yet scanned
  SCANNED = 'SCANNED',     // Already used for event entry — cannot be reused
  CANCELLED = 'CANCELLED', // Invalidated by admin (e.g. refund, fraud)
  EXPIRED = 'EXPIRED',     // Event date has passed
}

/**
 * The core domain entity — represents a single digital event ticket.
 * This is what gets stored in the database (or in-memory map for this prototype).
 *
 * The optional `?` fields are either set later in the lifecycle (scannedAt)
 * or are genuinely optional input (attendeeName, qrCodeUrl).
 */
export interface Ticket {
  id: string;              // Unique identifier — UUID v4 generated at creation
  attendeeEmail: string;   // Registrant's email (also the recipient of this ticket)
  attendeeName?: string;   // Optional: human-readable name for display at entry
  status: TicketStatus;    // Current lifecycle state
  createdAt: Date;         // When the ticket was issued (set by the repository)
  scannedAt?: Date;        // Set to the moment of the FIRST successful scan
  qrCodeUrl?: string;      // URL/path of the generated QR image (e.g., an S3 URL)
}

// ─── QR Code Options ──────────────────────────────────────────────────────────

/**
 * Options shared by all QR code generation calls.
 * Using an interface hierarchy (Base → Specific) avoids repeating common fields
 * and makes it clear which options apply to which generator.
 */
export interface BaseQrOptions {
  width?: number;          // Output image width in pixels (default: 1024)
  margin?: number;         // Quiet-zone size in QR modules — scanners need ≥4
  darkColor?: string;      // Hex colour for dark modules e.g. '#1a1a2e'
  lightColor?: string;     // Hex colour for light modules / background e.g. '#ffffff'
}

/**
 * Options for the marketing Stand QR code.
 * Extends BaseQrOptions with branding-specific fields.
 *
 * The logo fields are optional — if logoPath is omitted, a plain (unbranded)
 * QR is generated. The `?` makes this explicit in the type system.
 */
export interface StandQrOptions extends BaseQrOptions {
  logoPath?: string;       // Absolute filesystem path to a PNG/JPG logo file
  logoSizeRatio?: number;  // Logo width as a fraction of QR width (default: 0.2 = 20%)
  outputFilename?: string; // Output filename without extension (default: 'stand-qr')
}

/**
 * Options for per-ticket QR codes.
 * Logo fields mirror StandQrOptions — ticket QRs now also receive the branded
 * overlay so every scanned code on the day carries consistent event identity.
 */
export interface TicketQrOptions extends BaseQrOptions {
  outputFilename?: string; // Output filename (default: 'ticket-{ticketId}')
  logoPath?: string;       // Absolute filesystem path to logo (default: assets/logo.png)
  logoSizeRatio?: number;  // Logo width as fraction of QR width (default: from config)
}

// ─── Service Return Types ─────────────────────────────────────────────────────

/**
 * What every QR generation function returns.
 * Multiple formats are provided so callers can pick what they need:
 * - filePath  → attach to an email or link from admin UI
 * - dataUrl   → embed directly in HTML email body (<img src="data:...">)
 * - svgString → render inline in a web page (resolution-independent)
 * - content   → the actual URL/text encoded in the QR (useful for logging/auditing)
 */
export interface QrGenerationResult {
  filePath: string;        // Absolute path to the saved .png file on disk
  dataUrl: string;         // Base64 data URL: 'data:image/png;base64,...'
  svgString: string;       // Raw SVG markup string
  content: string;         // The URL/string encoded inside the QR code
}

/**
 * Result returned from verifyTicket().
 * Designed for consumption by an HTTP handler or a physical scanner UI:
 * - success    → boolean for a quick pass/fail gate
 * - ticket     → full entity when available (useful for displaying attendee name)
 * - errorCode  → machine-readable error for client-side branching logic
 * - message    → human-readable string for staff operating the scanner
 */
export interface TicketVerificationResult {
  success: boolean;
  ticket?: Ticket;
  errorCode?: TicketErrorCode;
  message: string;
}

/**
 * Typed error codes for ticket verification failures.
 * Using an enum here (instead of plain strings) means the client code can do:
 *   if (result.errorCode === TicketErrorCode.ALREADY_SCANNED) { ... }
 * without any magic-string comparisons.
 */
export enum TicketErrorCode {
  NOT_FOUND      = 'TICKET_NOT_FOUND',
  ALREADY_SCANNED = 'TICKET_ALREADY_SCANNED',
  CANCELLED      = 'TICKET_CANCELLED',
  EXPIRED        = 'TICKET_EXPIRED',
  INVALID_FORMAT = 'TICKET_INVALID_FORMAT',
}

// ─── Repository Interface ─────────────────────────────────────────────────────

/**
 * ITicketRepository — the contract that any data storage layer must fulfil.
 *
 * WHY THIS PATTERN (Repository Pattern)?
 * The business logic (TicketService) should not know or care whether data
 * lives in PostgreSQL, MongoDB, Redis, or a JavaScript Map. By depending on
 * this interface — not a concrete class — we can:
 *
 * 1. Swap the storage engine without touching TicketService
 * 2. Pass a lightweight InMemoryTicketRepository in tests (no DB spin-up needed)
 * 3. Enforce a clear API boundary between the service and data layers
 *
 * To integrate a real database, create a class that implements this interface
 * (e.g. PostgresTicketRepository) and pass it to TicketService's constructor.
 */
export interface ITicketRepository {
  /**
   * Look up a single ticket by its unique ID.
   * Returns null (not an exception) when not found — callers decide what to do.
   */
  findById(id: string): Promise<Ticket | null>;

  /**
   * Persist a new ticket and return the fully-formed entity.
   * The repository is responsible for generating `id` and `createdAt`,
   * mirroring how a real database auto-generates primary keys and timestamps.
   *
   * `Omit<Ticket, 'id' | 'createdAt'>` is a TypeScript utility type that
   * produces the Ticket type with those two fields removed — the caller
   * provides everything else.
   */
  create(data: Omit<Ticket, 'id' | 'createdAt'>): Promise<Ticket>;

  /**
   * Atomically update a ticket's status (and optionally set scannedAt).
   * Returns the updated ticket, or null if the ticket doesn't exist.
   *
   * NOTE: In a production database implementation this MUST be a single
   * atomic UPDATE statement to prevent race conditions with concurrent scans.
   */
  updateStatus(id: string, status: TicketStatus, scannedAt?: Date): Promise<Ticket | null>;

  /** Return all tickets — for admin views and debugging. */
  findAll(): Promise<Ticket[]>;
}
