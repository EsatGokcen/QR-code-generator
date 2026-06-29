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

// Default logo asset location — drop a PNG here to brand every QR code.
// Both stand and ticket generators look here automatically.  If the file is
// absent the server falls back to a generated Sega-themed placeholder and
// logs a warning, so QR generation never throws during a live demo.
const LOGO_PATH = path.resolve(__dirname, '../../assets/logo.png');

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
 * Generates a Sega-branded placeholder logo as a programmatic Jimp image.
 * Called when no physical logo file exists at LOGO_PATH.
 *
 * Output is a concentric-square mark:
 *   ┌────────────────────────┐
 *   │  Sega deep-blue outer  │
 *   │  ┌──────────────────┐  │
 *   │  │  White ring      │  │
 *   │  │  ┌────────────┐  │  │
 *   │  │  │ Blue core  │  │  │
 *   │  │  └────────────┘  │  │
 *   │  └──────────────────┘  │
 *   └────────────────────────┘
 *
 * The nested-square pattern reads as a deliberate mark even when composited
 * at 200px, and is visually distinct from the QR module pattern around it.
 *
 * new Jimp(w, h, color) is synchronous in Jimp v0.22 — no I/O, just memory.
 */
function createPlaceholderLogo(size: number): Jimp {
  const img  = new Jimp(size, size, 0x003791ff); // Sega deep blue (#003791), opaque
  const ring = new Jimp(Math.floor(size * 0.72), Math.floor(size * 0.72), 0xffffffff);
  const core = new Jimp(Math.floor(size * 0.46), Math.floor(size * 0.46), 0x003791ff);

  img.composite(ring, Math.floor((size - ring.getWidth()) / 2), Math.floor((size - ring.getHeight()) / 2));
  img.composite(core, Math.floor((size - core.getWidth()) / 2), Math.floor((size - core.getHeight()) / 2));

  return img;
}

/**
 * Loads a logo from disk.  If the file is absent or unreadable, emits a
 * console warning and returns the generated placeholder instead.
 * QR generation therefore never throws on a missing asset file.
 *
 * @param logoPath       - Absolute path to a PNG/JPG logo file
 * @param placeholderSize - Pixel size passed to createPlaceholderLogo if needed
 */
async function loadLogoWithFallback(logoPath: string, placeholderSize: number): Promise<Jimp> {
  try {
    await fs.access(logoPath);
    return await Jimp.read(logoPath);
  } catch {
    console.warn(
      `[QrService] Logo not found at "${path.relative(process.cwd(), logoPath)}" ` +
      `— using Sega placeholder. Add a PNG at assets/logo.png to replace it.`
    );
    return createPlaceholderLogo(placeholderSize);
  }
}

/**
 * Composites a pre-loaded Jimp logo onto the exact centre of a QR code PNG.
 *
 * ASPECT-RATIO SAFE SCALING:
 * The logo is scaled to fit inside a square bounding box (logoSize × logoSize)
 * while preserving its original width-to-height ratio. A wide logo like the
 * Sega wordmark is fitted by width with height scaled proportionally — it is
 * never stretched into a square.
 *
 * WHITE MATTE SQUARE:
 * The scaled logo is centred onto a solid white square matte that exactly fills
 * the bounding box. The matte is what gets composited onto the QR, not the logo
 * directly. This has three benefits:
 *   1. The white block cleanly occludes the underlying QR modules — no modules
 *      "bleed through" a transparent or semi-transparent logo edge.
 *   2. The logo never overflows the error-correction budget regardless of its
 *      aspect ratio (the matte is always exactly logoSize × logoSize).
 *   3. The white background provides maximum contrast for any dark-coloured logo.
 *
 * @param qrBuffer  - PNG bytes of the generated QR code
 * @param logo      - Pre-loaded Jimp image (real asset or generated placeholder)
 * @param sizeRatio - Bounding-box width as a fraction of QR width (e.g. 0.22)
 */
async function compositeLogoOntoQr(
  qrBuffer: Buffer,
  logo: Jimp,
  sizeRatio: number
): Promise<Buffer> {
  const qrImage  = await Jimp.read(qrBuffer);
  const qrWidth  = qrImage.getWidth();
  const qrHeight = qrImage.getHeight();

  // The square bounding box the logo must fit inside
  const boxSize = Math.floor(qrWidth * sizeRatio);

  // ── Aspect-ratio-preserving scale ──────────────────────────────────────────
  // Read the logo's original pixel dimensions (no resize yet)
  const srcW = logo.bitmap.width;
  const srcH = logo.bitmap.height;
  const aspectRatio = srcW / srcH;

  let scaledW: number;
  let scaledH: number;

  if (aspectRatio >= 1) {
    // Wider than tall (or square): fit to box width, scale height down
    scaledW = boxSize;
    scaledH = Math.round(boxSize / aspectRatio);
  } else {
    // Taller than wide: fit to box height, scale width down
    scaledH = boxSize;
    scaledW = Math.round(boxSize * aspectRatio);
  }

  // resize() is in-place; caller always provides a fresh Jimp instance per call
  logo.resize(scaledW, scaledH);

  // ── White matte square ──────────────────────────────────────────────────────
  // Centre the scaled logo on a white square that matches the full bounding box.
  // This square is what lands on the QR — never the logo bitmap directly.
  const matte  = new Jimp(boxSize, boxSize, 0xffffffff);
  const matteX = Math.floor((boxSize - scaledW) / 2);
  const matteY = Math.floor((boxSize - scaledH) / 2);

  matte.composite(logo, matteX, matteY, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  });

  // ── Centre matte on QR ──────────────────────────────────────────────────────
  const x = Math.floor((qrWidth  - boxSize) / 2);
  const y = Math.floor((qrHeight - boxSize) / 2);

  qrImage.composite(matte, x, y, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  });

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

  // Logo overlay — always applied. Falls back to Sega placeholder if no file exists.
  // Pass options.logoPath to override the default LOGO_PATH for a specific call.
  const logoPath = options.logoPath ?? LOGO_PATH;
  const placeholderSize = Math.floor(width * logoSizeRatio);
  const logo = await loadLogoWithFallback(logoPath, placeholderSize);
  const finalPngBuffer = await compositeLogoOntoQr(rawPngBuffer, logo, logoSizeRatio);

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
  const [rawPngBuffer, svgString] = await Promise.all([
    generateQrPngBuffer(content, renderOpts),
    generateQrSvgString(content, renderOpts),
  ]);

  // Logo overlay — always applied with graceful placeholder fallback,
  // matching the same behaviour as generateStandQr so every QR code in
  // the system carries consistent event branding out of the box.
  const logoSizeRatio = options.logoSizeRatio ?? config.qr.logoSizeRatio;
  const logoPath      = options.logoPath ?? LOGO_PATH;
  const placeholderSize = Math.floor(width * logoSizeRatio);
  const logo = await loadLogoWithFallback(logoPath, placeholderSize);
  const finalPngBuffer = await compositeLogoOntoQr(rawPngBuffer, logo, logoSizeRatio);

  const filePath = path.join(config.output.dir, `${outputFilename}.png`);
  await fs.writeFile(filePath, finalPngBuffer);

  const dataUrl = `data:image/png;base64,${finalPngBuffer.toString('base64')}`;

  return { filePath, dataUrl, svgString, content };
}
