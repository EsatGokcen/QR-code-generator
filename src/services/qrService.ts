/**
 * src/services/qrService.ts — QR Code Generation Service
 *
 * Responsible for ALL QR code image generation in the system.
 *
 * This service is:
 * - PURE UTILITY: no database dependency, completely stateless
 * - INDEPENDENTLY TESTABLE: can be tested in isolation without mocking any DB
 * - SINGLE RESPONSIBILITY: it generates images; it does not validate tickets
 *
 * Two generators are exposed:
 * ┌──────────────┬────────────────────────────────────────────────────────┐
 * │ generateStandQr  │ Marketing QR for event stands → landing page URL  │
 * │ generateTicketQr │ Unique per-ticket → verification API endpoint URL  │
 * └──────────────┴────────────────────────────────────────────────────────┘
 *
 * Dependencies:
 *   qrcode  — QR matrix generation + PNG buffer / SVG string rendering
 *   jimp    — Pure-JS image processing; composites the logo onto the PNG
 *             (swap for `sharp` in production for ~10× faster processing)
 */

import QRCode from 'qrcode';
import Jimp from 'jimp';
import fs from 'fs/promises';
import path from 'path';
import { config, urls } from '../config';
import { StandQrOptions, TicketQrOptions, QrGenerationResult } from '../types';

// ─── Private Helpers ──────────────────────────────────────────────────────────
// These functions are not exported — they are implementation details of this
// module. Only the two public generators at the bottom are part of the API.

/**
 * Ensures the output directory exists before writing files to it.
 *
 * `fs.mkdir` with `recursive: true` is idempotent:
 * - If the directory already exists, it succeeds silently (no error thrown)
 * - If parent directories are missing, it creates them too
 * This is safe to call on every generation request.
 */
async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(config.output.dir, { recursive: true });
}

/**
 * Core QR PNG generator — wraps the `qrcode` library and returns a Buffer.
 *
 * WHY BUFFER AND NOT DIRECT FILE WRITE?
 * We return a Buffer (in-memory PNG bytes) rather than writing directly to disk.
 * This allows us to optionally modify the image (e.g. add a logo) before saving.
 * If we wrote to disk first, we'd need to read it back for modification — wasteful.
 *
 * ERROR CORRECTION LEVEL 'H':
 * The QR spec defines four levels of Reed-Solomon error correction:
 *   L=7%  M=15%  Q=25%  H=30%
 * We use H so a logo can cover up to 30% of the pattern at the centre.
 * The cost: 'H' produces a denser (more modules) QR — still easily scannable
 * by any modern phone camera, just slightly more visually complex.
 */
async function generateQrPngBuffer(
  content: string,
  opts: { width: number; margin: number; darkColor: string; lightColor: string }
): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    errorCorrectionLevel: config.qr.errorCorrectionLevel, // 'H'
    type: 'png',
    width: opts.width,
    margin: opts.margin,
    color: {
      dark: opts.darkColor,   // The "on" modules (dark squares)
      light: opts.lightColor, // The "off" modules (light background)
    },
  });
}

/**
 * SVG generator — returns the QR as a raw SVG string.
 *
 * SVG is resolution-independent, making it ideal for:
 * - Web display (renders sharply at any zoom level)
 * - Large-format print files (no pixelation when scaled up)
 *
 * Limitation: this library does not support logo injection into SVG output.
 * For a branded SVG, you would need to inject an <image> tag manually after
 * parsing the SVG string (e.g. using xmldom or cheerio).
 */
async function generateQrSvgString(
  content: string,
  opts: { width: number; margin: number; darkColor: string; lightColor: string }
): Promise<string> {
  return QRCode.toString(content, {
    errorCorrectionLevel: config.qr.errorCorrectionLevel,
    type: 'svg',
    width: opts.width,
    margin: opts.margin,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Composites a logo image onto the exact centre of a QR code PNG.
 *
 * The centre is the safest location because:
 * 1. It avoids the three corner "finder patterns" which scanners locate first
 * 2. Error correction (level H) is specifically designed to recover the centre
 * 3. It is the standard expected position for QR logos
 *
 * PROCESS:
 * 1. Load both images into memory as Jimp instances
 * 2. Resize the logo to `sizeRatio` × QR width (square crop)
 * 3. Calculate the pixel coordinates for dead centre
 * 4. Composite (overlay) the logo using standard alpha blending
 * 5. Return the combined image as a PNG Buffer
 *
 * @param qrBuffer   - PNG bytes of the generated QR code
 * @param logoPath   - Filesystem path to the logo image (PNG, JPG, BMP, GIF, TIFF)
 * @param sizeRatio  - Logo width as a fraction of QR width (e.g. 0.2 = 20%)
 */
async function compositeLogoOntoQr(
  qrBuffer: Buffer,
  logoPath: string,
  sizeRatio: number
): Promise<Buffer> {
  // Load both images concurrently — no dependency between the two reads
  const [qrImage, logoImage] = await Promise.all([
    Jimp.read(qrBuffer),  // Jimp.read() accepts a Buffer directly
    Jimp.read(logoPath),  // Also accepts a file path, URL, or Jimp instance
  ]);

  const qrWidth = qrImage.getWidth();
  const logoSize = Math.floor(qrWidth * sizeRatio); // e.g. 1024 × 0.2 = 204px

  // Resize the logo to a square of `logoSize × logoSize` pixels.
  // Jimp.AUTO as the second argument would preserve aspect ratio — we use
  // a fixed square here so the logo always fits neatly in the centre cell.
  logoImage.resize(logoSize, logoSize);

  // Calculate top-left pixel coordinates to centre the logo
  const x = Math.floor((qrWidth - logoSize) / 2);
  const y = Math.floor((qrImage.getHeight() - logoSize) / 2);

  // BLEND_SOURCE_OVER is the standard "paint on top" alpha compositing mode.
  // opacitySource: 1 = logo is fully opaque (no transparency)
  // opacityDest: 1   = QR background is fully preserved where logo doesn't cover
  qrImage.composite(logoImage, x, y, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  });

  // Encode the modified Jimp image back to a PNG Buffer for writing to disk
  return qrImage.getBufferAsync(Jimp.MIME_PNG);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * generateStandQr — Marketing Stand QR Code Generator
 *
 * Generates a large-format, optionally branded QR code that points to the
 * marketing landing page (config.marketingUrl). This single QR is printed
 * and displayed on event stands — every scan goes to the same URL.
 *
 * OUTPUTS:
 * - A high-resolution PNG file saved to the output directory
 * - An SVG string for web display / further customisation
 * - A base64 data URL for embedding directly in HTML or email
 *
 * BRANDING:
 * Pass `darkColor` / `lightColor` to apply custom brand colours.
 * Pass `logoPath` to composite a logo at the centre (requires a PNG/JPG file).
 *
 * @param options - Optional branding parameters (all have sensible defaults)
 * @returns       QrGenerationResult with all output formats
 *
 * @example
 * const result = await generateStandQr({
 *   darkColor: '#1a1a2e',
 *   lightColor: '#e8f4fd',
 *   logoPath: path.resolve('./assets/logo.png'),
 * });
 * console.log(result.filePath); // '/abs/path/output/stand-qr.png'
 */
export async function generateStandQr(
  options: StandQrOptions = {}
): Promise<QrGenerationResult> {
  await ensureOutputDir();

  // Merge caller-provided options with config defaults.
  // The `??` operator means "use the right side only if the left side is null/undefined".
  // This preserves falsy-but-valid values like '' or 0 (unlike the `||` operator).
  const width = options.width ?? config.qr.width;
  const margin = options.margin ?? config.qr.margin;
  const darkColor = options.darkColor ?? config.qr.darkColor;
  const lightColor = options.lightColor ?? config.qr.lightColor;
  const logoSizeRatio = options.logoSizeRatio ?? config.qr.logoSizeRatio;
  const outputFilename = options.outputFilename ?? 'stand-qr';
  const content = config.marketingUrl; // Stand QR always encodes the marketing URL

  const renderOpts = { width, margin, darkColor, lightColor };

  // Generate PNG buffer and SVG string simultaneously.
  // Promise.all() runs both async operations in parallel — faster than awaiting sequentially.
  const [rawPngBuffer, svgString] = await Promise.all([
    generateQrPngBuffer(content, renderOpts),
    generateQrSvgString(content, renderOpts),
  ]);

  // Apply logo overlay if a path was provided
  let finalPngBuffer = rawPngBuffer;
  if (options.logoPath) {
    // Validate the logo file is accessible before attempting to read it.
    // `fs.access()` checks permissions without reading the file — cheaper than fs.stat().
    // We throw a descriptive error rather than letting jimp throw a cryptic one.
    try {
      await fs.access(options.logoPath);
    } catch {
      throw new Error(
        `Logo file not found or not readable: "${options.logoPath}".\n` +
        `Provide an absolute path to a PNG or JPG file.`
      );
    }
    finalPngBuffer = await compositeLogoOntoQr(rawPngBuffer, options.logoPath, logoSizeRatio);
  }

  // Write the final PNG to disk
  const filePath = path.join(config.output.dir, `${outputFilename}.png`);
  await fs.writeFile(filePath, finalPngBuffer);

  // Build a base64 data URL — lets the QR be embedded directly in an <img> tag
  // without needing a separate HTTP request for the image file.
  // Format: 'data:image/png;base64,<base64-encoded-bytes>'
  const dataUrl = `data:image/png;base64,${finalPngBuffer.toString('base64')}`;

  return { filePath, dataUrl, svgString, content };
}

/**
 * generateTicketQr — Unique Event Ticket QR Code Generator
 *
 * Generates a one-off QR code for a specific ticket. The QR encodes a
 * verification URL containing the ticket's unique ID:
 *   https://api.event.com/v1/tickets/verify/{ticketId}
 *
 * When a scanner reads this QR at the event entrance:
 * 1. The scanner opens the URL (or sends it to the backend)
 * 2. The backend calls verifyTicket(ticketId) from TicketService
 * 3. The ticket is marked SCANNED — any subsequent scan is rejected
 *
 * WHY PUT THE ID IN A URL (NOT JUST THE RAW ID)?
 * Embedding a full URL makes the QR self-describing. A scanner that opens URLs
 * (like any phone camera) automatically hits the verification endpoint without
 * needing a custom app. It also makes the intent obvious to anyone who reads
 * the raw QR content for debugging.
 *
 * @param ticketId - The UUID of the ticket to encode
 * @param options  - Optional appearance overrides
 * @returns        QrGenerationResult with all output formats
 */
export async function generateTicketQr(
  ticketId: string,
  options: TicketQrOptions = {}
): Promise<QrGenerationResult> {
  await ensureOutputDir();

  const width = options.width ?? config.qr.width;
  const margin = options.margin ?? config.qr.margin;
  const darkColor = options.darkColor ?? config.qr.darkColor;
  const lightColor = options.lightColor ?? config.qr.lightColor;
  const outputFilename = options.outputFilename ?? `ticket-${ticketId}`;

  // The verification URL is what gets encoded into the QR pattern
  const content = urls.ticketVerify(ticketId);

  const renderOpts = { width, margin, darkColor, lightColor };

  // Generate both formats in parallel (same pattern as generateStandQr)
  const [pngBuffer, svgString] = await Promise.all([
    generateQrPngBuffer(content, renderOpts),
    generateQrSvgString(content, renderOpts),
  ]);

  const filePath = path.join(config.output.dir, `${outputFilename}.png`);
  await fs.writeFile(filePath, pngBuffer);

  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  return { filePath, dataUrl, svgString, content };
}
