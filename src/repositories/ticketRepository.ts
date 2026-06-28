/**
 * src/repositories/ticketRepository.ts — Data Access Layer
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  THE REPOSITORY PATTERN — Why it exists                                 │
 * │                                                                         │
 * │  The Repository Pattern is a layer of abstraction between your          │
 * │  business logic (TicketService) and your data store (database/file/etc).│
 * │                                                                         │
 * │  TicketService depends ONLY on the ITicketRepository interface,         │
 * │  never on a concrete class. This means:                                 │
 * │                                                                         │
 * │  • Swap storage engines without touching service code                   │
 * │  • Unit-test services by injecting a fast in-memory repository          │
 * │  • Add caching layers transparently (e.g. Redis → Postgres fallback)    │
 * │                                                                         │
 * │  TO ADD A REAL DATABASE:                                                │
 * │  1. Create class PostgresTicketRepository implements ITicketRepository  │
 * │  2. Implement each method using your DB client (Prisma, Knex, etc.)     │
 * │  3. In index.ts, pass `new PostgresTicketRepository(dbClient)` to       │
 * │     TicketService — zero changes to the service itself.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { ITicketRepository, Ticket, TicketStatus } from "../types";
import { generateTicketId } from "../utils/idGenerator";

/**
 * InMemoryTicketRepository — the prototype / test implementation.
 *
 * Storage: a JavaScript Map<string, Ticket>
 * - O(1) reads and writes by ID (same complexity as a primary-key lookup)
 * - Reset on every process restart (no persistence — intentional for prototype)
 * - Not thread-safe (Node.js is single-threaded so concurrent JS is fine,
 *   but multiple server instances would each have separate stores)
 *
 * This class is the complete, working implementation for the prototype.
 * In production, replace it without modifying TicketService.
 */
export class InMemoryTicketRepository implements ITicketRepository {
  /**
   * The in-memory "database table".
   * Map key: ticket ID (string)
   * Map value: full Ticket object
   *
   * `private readonly` means nothing outside this class can replace the Map
   * itself (though its contents can change via the public methods).
   */
  private readonly store = new Map<string, Ticket>();

  /**
   * Retrieve a single ticket by ID.
   *
   * Returns `null` (not an exception) when not found.
   * This follows the Null Object convention: the calling code can safely
   * do `if (!ticket)` rather than wrapping everything in try/catch.
   *
   * The `??` (nullish coalescing) returns the right side if the left is
   * null or undefined — `Map.get()` returns undefined for missing keys,
   * which we convert to null to match the interface contract.
   */
  async findById(id: string): Promise<Ticket | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Persist a new ticket and return the fully-formed entity with its ID.
   *
   * The caller provides everything EXCEPT `id` and `createdAt` — the
   * repository generates those, mirroring how a real database auto-generates
   * primary keys and creation timestamps.
   *
   * `Omit<Ticket, 'id' | 'createdAt'>` is a TypeScript utility type: it
   * takes the Ticket type and removes the named fields, producing a new type.
   */
  async create(data: Omit<Ticket, "id" | "createdAt">): Promise<Ticket> {
    const ticket: Ticket = {
      ...data, // Spread caller-provided fields
      id: generateTicketId(), // Repository owns ID generation
      createdAt: new Date(), // Repository stamps creation time
    };

    this.store.set(ticket.id, ticket);
    return ticket; // Return the complete entity (including generated fields)
  }

  /**
   * Update a ticket's status and optionally record the scan timestamp.
   *
   * Returns the updated Ticket, or null if the ID doesn't exist.
   * The service layer uses the null return to detect "update target missing".
   *
   * IMMUTABILITY NOTE:
   * We build a *new* object (`{ ...ticket, status, ... }`) rather than
   * mutating the stored ticket directly. This is a safer pattern because:
   * - Mutations are harder to trace in logs and debuggers
   * - It mirrors how SQL UPDATE + SELECT works (you get the updated row back)
   * - A database implementation would naturally return a new object anyway
   *
   * PRODUCTION NOTE:
   * In a real database this should be a single atomic statement:
   *   UPDATE tickets SET status=$1, scanned_at=$2 WHERE id=$3 RETURNING *
   * The "check then update" in JS is fine for a single-process prototype
   * but creates a race condition under concurrent load (two scanners hitting
   * the same ticket simultaneously could both see ACTIVE and both grant entry).
   */
  async updateStatus(
    id: string,
    status: TicketStatus,
    scannedAt?: Date,
  ): Promise<Ticket | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: Ticket = {
      ...existing,
      status,
      // Only add scannedAt to the object if a value was provided.
      // The spread conditional `...(condition && { key: value })` is a
      // concise TypeScript pattern for conditional property merging.
      ...(scannedAt !== undefined && { scannedAt }),
    };

    this.store.set(id, updated);
    return updated;
  }

  /**
   * Return every ticket in the store.
   *
   * `Map.values()` returns a MapIterator, which `Array.from()` converts
   * to a plain array that can be mapped, filtered, and sorted.
   *
   * In production, add pagination parameters:
   *   findAll(page: number, pageSize: number): Promise<{ items: Ticket[]; total: number }>
   */
  async findAll(): Promise<Ticket[]> {
    return Array.from(this.store.values());
  }
}
