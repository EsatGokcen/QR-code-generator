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
 * Without this, browsers block requests from a different origin (port) than
 * the server. The Vite dev server runs on :5173, our API on :3001 — those
 * are different origins, so CORS headers are required.
 *
 * ALLOWED_ORIGINS is comma-separated in .env:
 *   ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');

app.use(
  cors({
    origin: (incomingOrigin, callback) => {
      // Allow requests with no Origin header (curl, Postman, server-to-server calls)
      if (!incomingOrigin || allowedOrigins.includes(incomingOrigin)) {
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

app.listen(PORT, () => {
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
