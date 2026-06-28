/**
 * src/config/index.ts — Centralised Configuration
 *
 * All runtime-configurable values live here. Environment variables take
 * priority, with sensible defaults for local development.
 *
 * WHY CENTRALISE CONFIG?
 * Hardcoding URLs or settings inside service files makes it impossible to
 * deploy the same codebase across environments (dev / staging / production)
 * without modifying source code. This module is the single source of truth
 * for every value that changes between deployments.
 *
 * HOW TO USE:
 * 1. Copy .env.example to .env and fill in your values
 * 2. Import { config } or { urls } wherever you need a configured value
 * 3. Never import process.env directly in service or repository files
 */

import path from 'path';

/**
 * Helper that reads an environment variable and throws a clear error
 * if a required variable is missing, rather than silently using `undefined`.
 *
 * @param key          - The environment variable name
 * @param defaultValue - Fallback for local development (omit to make required)
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    // Fail loudly at startup rather than silently at runtime
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Copy .env.example to .env and set a value for ${key}.`
    );
  }
  return value;
}

export const config = {
  // ── API / URL ──────────────────────────────────────────────────────────────
  api: {
    /**
     * The public base URL of this backend service.
     * All ticket verification URLs are built from this.
     * Production: 'https://api.event.com'
     */
    baseUrl: getEnv('API_BASE_URL', 'https://api.event.com'),

    /**
     * URL path version prefix.
     * Keeps old clients working if you need to introduce breaking API changes.
     */
    version: getEnv('API_VERSION', 'v1'),
  },

  /**
   * The marketing landing page that Stand QR codes encode.
   * This is a *different* URL from the API — it's a frontend page where
   * attendees register their email after scanning the stand QR.
   */
  marketingUrl: getEnv('MARKETING_URL', 'https://event.com/register'),

  // ── QR Code Defaults ───────────────────────────────────────────────────────
  qr: {
    /**
     * Error correction level. Controls how much of the QR pattern can be
     * damaged or obscured while remaining scannable:
     *   L = 7%   M = 15%   Q = 25%   H = 30%
     *
     * We use 'H' so a logo can overlay the centre (≤20% of the area) without
     * breaking scannability. The trade-off: 'H' produces a denser QR code.
     */
    errorCorrectionLevel: 'H' as const,

    /**
     * Quiet zone width in QR modules (the blank border around the pattern).
     * The QR spec requires a minimum of 4 modules. Going below this will
     * cause many scanner apps to fail.
     */
    margin: 4,

    /**
     * Output image width in pixels.
     * 1024px gives excellent print quality at A4 / A3 sizes.
     * Reduce to 512 for faster generation in high-throughput ticket scenarios.
     */
    width: 1024,

    // Default brand colours — override per-call via StandQrOptions
    darkColor: '#000000',
    lightColor: '#ffffff',

    /**
     * Fraction of the QR width the logo occupies.
     * 0.2 = 20%, which is the safe upper limit given 'H' error correction.
     * Exceed this and some scanners may fail.
     */
    logoSizeRatio: 0.2,
  },

  // ── File System ────────────────────────────────────────────────────────────
  output: {
    /**
     * Directory where generated QR PNG files are written.
     * path.resolve() converts a relative path to absolute,
     * making the location unambiguous regardless of where Node is invoked from.
     *
     * In production, replace file-system writes with S3 (or equivalent)
     * uploads and store the resulting URL on the ticket record.
     */
    dir: path.resolve(getEnv('OUTPUT_DIR', './output')),
  },
} as const; // `as const` makes all values readonly and preserves literal types

// ─── Derived / Computed URLs ──────────────────────────────────────────────────

/**
 * URL factory functions built from config values.
 * Kept separate from config to avoid polluting the config object with functions
 * (which don't play well with `as const`).
 */
export const urls = {
  /**
   * Builds the full ticket verification URL that gets encoded into a Ticket QR.
   * Example: 'https://api.event.com/v1/tickets/verify/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
   *
   * When a scanner reads the QR, it hits this endpoint.
   * The backend handler extracts the ticketId and calls verifyTicket().
   */
  ticketVerify: (ticketId: string): string =>
    `${config.api.baseUrl}/${config.api.version}/tickets/verify/${ticketId}`,
};
