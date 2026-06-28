/**
 * src/utils/idGenerator.ts — Cryptographically Secure ID Generation
 *
 * Ticket IDs must be:
 * 1. Unique       — no two tickets can share the same ID
 * 2. Unpredictable — an attacker must not be able to guess or enumerate IDs
 * 3. URL-safe     — the ID appears in verification URLs, so no encoding needed
 *
 * WHY DOES UNPREDICTABILITY MATTER?
 * If ticket IDs were sequential integers (1, 2, 3...) an attacker could:
 * - Guess ticket #5 after being issued ticket #4
 * - Scan all valid tickets by brute-forcing a small range
 * Both UUID v4 and crypto.randomBytes() use OS-level secure random sources
 * (e.g. /dev/urandom on Linux), making such attacks computationally infeasible.
 */

import crypto from 'crypto'; // Node built-in — no install required
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a UUID version 4 — the industry-standard unique identifier.
 *
 * UUID v4 format: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
 * - 122 bits of cryptographic randomness
 * - Dashes make it human-readable in logs and URLs
 * - Native UUID column type in PostgreSQL, MySQL, and most modern databases
 * - Collision probability with 100 million UUIDs: ~0.000000001%
 *
 * Example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generates a high-entropy hex string using Node's built-in crypto module.
 *
 * This calls directly into the OS's Cryptographically Secure Pseudo-Random
 * Number Generator (CSPRNG). Use this when you need more entropy than UUID v4
 * provides, or when you prefer a compact format without dashes.
 *
 * @param byteLength - Number of random bytes. 32 bytes = 256-bit entropy.
 *                     At 256 bits, the probability of any two IDs colliding
 *                     across the entire lifetime of the universe is negligible.
 *
 * Example (32 bytes): 'a3f2c1d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2'
 *                      (64 hex characters = 32 bytes × 2 chars/byte)
 */
export function generateCryptoId(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * The canonical ticket ID generator for this service.
 *
 * UUID v4 is the default because it:
 * - Is database-native (stored efficiently as a UUID column)
 * - Is human-readable enough to reference in support tickets
 * - Provides sufficient entropy (122 bits) for event-scale systems
 *
 * To upgrade security for high-risk scenarios (e.g., VIP tickets with
 * significant monetary value), replace the body with:
 *   return generateCryptoId(32); // 256-bit entropy, compact hex
 */
export function generateTicketId(): string {
  return generateUUID();
}
