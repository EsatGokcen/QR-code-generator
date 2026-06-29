/**
 * src/index.ts — QR Generation Demo Runner
 *
 * Demonstrates the full QR system end-to-end:
 *   A) Stand QR — encodes MARKETING_URL (set this to your tunnel URL in .env)
 *   B) Ticket QR generation for two attendees
 *   C) Ticket verification scenarios (valid / duplicate / fake / empty)
 *
 * ── TUNNEL WORKFLOW ────────────────────────────────────────────────────────
 * 1. Start your tunnel (Pinggy / ngrok) pointing at localhost:5173
 * 2. Copy the public URL (e.g. https://yourdemo.pinggy.link)
 * 3. Set MARKETING_URL=https://yourdemo.pinggy.link in .env
 * 4. Run `npm run dev` — the stand QR now encodes the tunnel URL
 * 5. A phone scanning the QR hits the tunnel → forwards to your local
 *    React frontend running on port 5173. No deployment needed.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Run with:
 *   npm run dev              → ts-node (no build step)
 *   npm run build && npm start → compiled JS
 */

// dotenv MUST be the very first import so that process.env is populated
// before any config module (src/config/index.ts, src/config/demoConfig.ts)
// evaluates its top-level `const config = {...}` statements.
import 'dotenv/config';

import fs from 'fs';
import { InMemoryTicketRepository } from './repositories/ticketRepository';
import { TicketService } from './services/ticketService';
import { generateStandQr } from './services/qrService';
import { config } from './config';

// ─── Dependency Injection / Wiring ───────────────────────────────────────────
//
// To switch to a real database:
//   1. Implement PostgresTicketRepository (or MongoTicketRepository, etc.)
//   2. Replace `new InMemoryTicketRepository()` with your implementation
//   3. Pass in any required clients (e.g. a pg.Pool or mongoose.Connection)
// Everything else in the system remains unchanged.

const ticketRepository = new InMemoryTicketRepository();
const ticketService    = new TicketService(ticketRepository);

// ─── Display Helpers ─────────────────────────────────────────────────────────

const LINE = '─'.repeat(60);

function header(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function row(label: string, value: unknown): void {
  const str = String(value);
  // Truncate long values (e.g. base64 data URLs) to keep output readable
  const display = str.length > 70 ? str.substring(0, 67) + '...' : str;
  console.log(`  ${label.padEnd(20)}: ${display}`);
}

function subHeader(title: string): void {
  console.log(`\n  ${LINE.substring(0, 55)}`);
  console.log(`  ${title}`);
  console.log(`  ${LINE.substring(0, 55)}`);
}

// ─── Main Demo ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🎮  Game Summit 2026 — QR Code Generation Demo');
  console.log(`    Output directory : ${config.output.dir}`);
  console.log(`    Marketing URL    : ${config.marketingUrl}`);
  console.log(`    API base URL     : ${config.api.baseUrl}`);

  // ── Ensure the output directory exists before any generation ──────────────
  // fs.mkdirSync with { recursive: true } is safe to call even if the
  // directory already exists — it is idempotent and never throws in that case.
  // Using the sync version here means the directory is guaranteed to exist
  // before the first async QR generation call begins.
  fs.mkdirSync(config.output.dir, { recursive: true });
  console.log(`    Output dir ready : ✓\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO 1 — Stand QR Code
  //
  // This is the QR code you print and display on the event stand.
  // It encodes MARKETING_URL — set that in .env to your tunnel URL so that
  // phones scanning it during the event hit your local React frontend.
  //
  // Example .env:
  //   MARKETING_URL=https://yourdemo.pinggy.link
  //
  // The tunnel forwards the public HTTPS request to localhost:5173 where
  // Vite is serving the registration landing page.
  // ═══════════════════════════════════════════════════════════════════════════
  header('DEMO 1 — Stand QR Code (Encodes MARKETING_URL)');
  console.log(`  Target URL: ${config.marketingUrl}`);
  console.log('  Generating 1024×1024 PNG...\n');

  const standResult = await generateStandQr({
    darkColor: '#003791',  // Sega-inspired deep blue
    lightColor: '#ffffff', // White background for maximum scanner contrast

    // To add a logo overlay (optional):
    //   logoPath: path.resolve('./assets/logo.png'),
    //   logoSizeRatio: 0.2,  // max safe size with error correction level H

    outputFilename: 'stand-marketing-qr',
  });

  row('Encodes URL', standResult.content);
  row('PNG saved to', standResult.filePath);
  row('SVG length', `${standResult.svgString.length.toLocaleString()} characters`);
  row('Data URL prefix', standResult.dataUrl.substring(0, 30) + '...');
  console.log('\n  ✓ Stand QR generated successfully.');

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO 2 — Ticket Creation + QR Generation
  // ═══════════════════════════════════════════════════════════════════════════
  header('DEMO 2 — Ticket QR Codes (Unique Per Attendee)');
  console.log('  Creating two attendee tickets and generating their QR codes...\n');

  // Attendee 1
  const {
    ticket: ticket1,
    qrFilePath: qr1Path,
  } = await ticketService.createTicket('alex.mercer@example.com', 'Alex Mercer');

  row('Ticket 1 ID', ticket1.id);
  row('Ticket 1 Email', ticket1.attendeeEmail);
  row('Ticket 1 Status', ticket1.status);
  row('Ticket 1 QR file', qr1Path);
  row('Encodes URL', `${config.api.baseUrl}/${config.api.version}/tickets/verify/${ticket1.id}`);

  console.log('');

  // Attendee 2
  const {
    ticket: ticket2,
    qrFilePath: qr2Path,
  } = await ticketService.createTicket('jordan.lee@studio.io', 'Jordan Lee');

  row('Ticket 2 ID', ticket2.id);
  row('Ticket 2 Email', ticket2.attendeeEmail);
  row('Ticket 2 QR file', qr2Path);

  console.log('\n  ✓ Both tickets created and QR codes generated.');

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO 3 — Ticket Verification (Three Scenarios)
  // ═══════════════════════════════════════════════════════════════════════════
  header('DEMO 3 — Ticket Verification (Entry Gate Simulation)');
  console.log('  Simulating three verification scenarios:\n');

  // ── Scenario A: First scan of a valid ticket → SHOULD SUCCEED ──────────────
  subHeader('Scenario A — First scan of Ticket 1  (expect: GRANTED)');
  const resultA = await ticketService.verifyTicket(ticket1.id);
  row('Success', resultA.success);
  row('Message', resultA.message);
  if (resultA.ticket) {
    row('Status is now', resultA.ticket.status);
    row('Scanned at', resultA.ticket.scannedAt?.toLocaleTimeString() ?? 'N/A');
  }

  // ── Scenario B: Duplicate scan of the same ticket → SHOULD BE REJECTED ─────
  subHeader('Scenario B — Second scan of Ticket 1  (expect: DENIED — already scanned)');
  const resultB = await ticketService.verifyTicket(ticket1.id);
  row('Success', resultB.success);
  row('Error code', resultB.errorCode ?? 'N/A');
  row('Message', resultB.message);

  // ── Scenario C: Completely fake ticket ID → SHOULD BE REJECTED ─────────────
  subHeader('Scenario C — Fake ticket ID  (expect: DENIED — not found)');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const resultC = await ticketService.verifyTicket(fakeId);
  row('Success', resultC.success);
  row('Error code', resultC.errorCode ?? 'N/A');
  row('Message', resultC.message);

  // ── Scenario D: Empty string (malformed input) → SHOULD BE REJECTED ────────
  subHeader('Scenario D — Empty string  (expect: DENIED — invalid format)');
  const resultD = await ticketService.verifyTicket('');
  row('Success', resultD.success);
  row('Error code', resultD.errorCode ?? 'N/A');
  row('Message', resultD.message);

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL STATE — Full ticket store snapshot
  // ═══════════════════════════════════════════════════════════════════════════
  header('Final State — All Tickets in Store');
  const allTickets = await ticketService.getAllTickets();

  allTickets.forEach((t, i) => {
    const scanInfo = t.scannedAt ? ` | Scanned @ ${t.scannedAt.toLocaleTimeString()}` : '';
    console.log(
      `  [${String(i + 1).padStart(2)}] ${t.status.padEnd(10)} ` +
      `| ${t.id} ` +
      `| ${t.attendeeEmail}${scanInfo}`
    );
  });

  console.log(`\n  Total tickets: ${allTickets.length}`);
  console.log('\n✅  Demo complete.\n');
  console.log(`    Open your output directory to inspect the generated QR codes:`);
  console.log(`    ${config.output.dir}\n`);
}

// Run and surface any unhandled errors with a clear exit code.
// Using .catch here (rather than try/catch inside main) keeps the top-level
// async main function clean and ensures Node exits with code 1 on failure.
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌  Fatal error: ${message}\n`);
  process.exit(1);
});
