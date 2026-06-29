/**
 * src/server.ts — Express HTTP Server Entry Point
 *
 * This is the COMPOSITION ROOT for the web server.
 * It is the only place where concrete implementations are bound to interfaces
 * and the dependency graph is assembled. All other modules see only abstractions.
 *
 * Run with:
 *   npm run server      → ts-node src/server.ts (backend only)
 *   npm run dev:all     → server + Vite client dev server together
 */

import 'dotenv/config'; // Load .env file before anything else reads process.env
import express from 'express';
import cors from 'cors';

// ─── Process-Level Crash Guards ───────────────────────────────────────────────
//
// WHY THESE ARE NECESSARY:
// Node.js has two categories of unhandled errors that kill the process:
//
// 1. uncaughtException — a synchronous throw that escapes all try/catch blocks.
//    Most commonly: an 'error' event emitted on a TCP/TLS socket with no listener.
//    Nodemailer opens raw sockets for SMTP. If the socket emits an 'error' event
//    AFTER the sendMail() promise has already settled (e.g. during socket teardown
//    after a failed auth), that error has no listener and becomes uncaughtException.
//
// 2. unhandledRejection — an async promise rejection with no .catch() or try/catch.
//    Express 4 does NOT automatically forward async route-handler rejections to
//    next(err); if anything slips past our try/catch blocks, it lands here.
//
// With these two handlers, the server logs the full error and STAYS RUNNING
// instead of crashing. Every active HTTP request continues to be served.
// In production, you would forward these to an alerting system (Sentry, Datadog).
process.on('uncaughtException', (err: Error) => {
  console.error('\n[Server] ⚠  Uncaught exception — server continues running.');
  console.error('[Server] Full stack:', err.stack ?? err.message);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('\n[Server] ⚠  Unhandled promise rejection — server continues running.');
  console.error('[Server] Reason:', reason);
});
import { InMemoryTicketRepository } from './repositories/ticketRepository';
import { TicketService } from './services/ticketService';
import { createRegistrationRouter } from './routes/registrationRouter';
import { demoConfig, isDemo } from './config/demoConfig';

// ─── Dependency Wiring ────────────────────────────────────────────────────────
// To switch to a real DB: replace InMemoryTicketRepository with your
// Postgres/Mongo implementation. Nothing else needs to change.

const ticketRepository = new InMemoryTicketRepository();
const ticketService    = new TicketService(ticketRepository);

// ─── Express Application ──────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Parse incoming JSON bodies.
// express.json() replaces the old body-parser package (built-in since Express 4.16).
app.use(express.json());

/**
 * CORS — Cross-Origin Resource Sharing.
 *
 * WHY TWO MODES?
 *
 * In production, the React client and the API live behind the same reverse
 * proxy (Nginx / ALB), so the browser sees a single origin and CORS is
 * irrelevant for same-origin requests. Any direct cross-origin call must
 * come from a trusted domain explicitly listed in ALLOWED_ORIGINS.
 *
 * In demo mode, the Express API is accessed through a local tunnel tool
 * (Pinggy, ngrok, localtunnel) that generates a new ephemeral public
 * hostname on every session. That hostname can't be pre-registered in
 * ALLOWED_ORIGINS.
 *
 * WHY VITE'S PROXY DOESN'T SOLVE THIS:
 * Vite's proxy (changeOrigin: true) only rewrites the HOST header so the
 * Express server receives requests as if they came from localhost. It does
 * NOT touch the ORIGIN header. The browser still stamps the real tunnel
 * URL as the Origin — e.g. "https://cxqbw-89-21-234-202.free.pinggy.net"
 * — and Express rejects it against the strict allowlist.
 *
 * PRODUCTION fallback: ALLOWED_ORIGINS env var (comma-separated).
 *   ALLOWED_ORIGINS=https://gamesummit.dev,https://www.gamesummit.dev
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin: (incomingOrigin, callback) => {
      // No Origin header → CLI tools (curl, Postman), same-origin server calls.
      // Always allow: these requests can't be cross-origin browser attacks.
      if (!incomingOrigin) {
        callback(null, true);
        return;
      }

      if (isDemo()) {
        // Demo / local development: reflect the caller's origin back.
        //
        // Tunnel utilities (Pinggy, ngrok, localtunnel) mint a new public
        // hostname every session, so we can't maintain a static allowlist.
        // Accepting any origin here is intentional and safe: the server only
        // runs on localhost, is not reachable from the internet on its own
        // port, and Mailtrap keeps emails out of real inboxes anyway.
        callback(null, true);
        return;
      }

      // Production: strict allowlist — reject anything not explicitly trusted.
      if (allowedOrigins.includes(incomingOrigin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${incomingOrigin}" is not in the allowlist`));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api', createRegistrationRouter(ticketService));

// Health-check: used by load balancers, uptime monitors, and the Vite proxy
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: demoConfig.mode,
    timestamp: new Date().toISOString(),
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  const modeTag = isDemo() ? '🧪  DEMO (Mailtrap sandbox)' : '🌐  PRODUCTION';
  console.log(`\n🚀  API server → http://localhost:${PORT}`);
  console.log(`    Mode       → ${modeTag}`);
  console.log(`    Health     → http://localhost:${PORT}/health`);
  console.log(`    Register   → POST http://localhost:${PORT}/api/register\n`);
  if (isDemo()) {
    console.log('    Emails will appear at: https://mailtrap.io/inboxes');
    console.log('    (add MAILTRAP_SMTP_USER + MAILTRAP_SMTP_PASS to .env)\n');
  }
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
//
// Without these handlers, Cmd+C sends SIGINT to the concurrently wrapper but
// the Node.js child process keeps its TCP socket open on port 3001. The OS
// doesn't reclaim the port until the kernel's TIME_WAIT period expires (up to
// 60s), causing EADDRINUSE on the next `npm run server` start.
//
// server.close() stops accepting new connections and waits for in-flight
// requests to finish before calling the callback — zero dropped requests.

const shutdown = () => {
  console.log('\n[Server] Received kill signal, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Closed out remaining connections. Port 3001 is now free.');
    process.exit(0);
  });
};

process.on('SIGINT',  shutdown); // Cmd+C / Ctrl+C
process.on('SIGTERM', shutdown); // system kill / concurrently --kill-others
