# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (root)
```bash
npm run dev        # Run the QR demo script (ts-node src/index.ts)
npm run server     # Start the Express API server on port 3001
npm run type-check # Type-check without emitting
npm run build      # Compile TypeScript → dist/
npm run clean      # Delete dist/ and output/
```

### Frontend (client/)
```bash
npm run --prefix client dev        # Vite dev server on port 5173
npm run --prefix client type-check # Type-check React code
npm run --prefix client build      # Production build → client/dist/
```

### Both together
```bash
npm run dev:all    # concurrently: API server + Vite client (recommended for demo)
```

## Architecture

Full-stack: Node.js/TypeScript Express backend + React/TypeScript/Vite frontend.

```
src/                              ← Backend
├── config/
│   ├── index.ts                  # Env-var config; all URLs derived here only
│   └── demoConfig.ts             # Demo/Production mode switch + Mailtrap credentials
├── types/index.ts                # All shared interfaces and enums
├── utils/idGenerator.ts          # UUID v4 + crypto fallback
├── repositories/
│   └── ticketRepository.ts       # ITicketRepository interface + InMemoryTicketRepository
├── services/
│   ├── qrService.ts              # Stateless QR image generation (PNG + SVG)
│   ├── ticketService.ts          # Ticket business logic (create, verify)
│   └── emailService.ts           # Mailtrap/Nodemailer email delivery
├── templates/
│   └── ticketEmailTemplate.ts    # HTML + text email template with CID QR attachment
├── routes/
│   └── registrationRouter.ts     # POST /api/register route handler
├── server.ts                     # Express server entry point (composition root)
└── index.ts                      # Standalone QR demo runner

client/src/                       ← React Frontend
├── types/index.ts                # API response types + SubmissionState union
├── validation/registrationSchema.ts  # Zod schema (field + full form validation)
├── hooks/useRegistration.ts      # Submission state machine + fetch logic
└── components/
    ├── ErrorBoundary.tsx          # Class component; catches render errors
    ├── LandingPage.tsx            # Page layout (hero, card, footer)
    ├── LandingPage.module.css     # Cyberpunk theme: grid bg, glitch animation, orbs
    ├── RegistrationForm.tsx       # Form UI with idle/loading/success/error states
    └── RegistrationForm.module.css
```

## Key Design Rules

**Repository pattern**: `TicketService` depends on `ITicketRepository`. To add a real DB, implement the interface and swap it in `src/server.ts` — nothing else changes.

**Dependency injection**: `TicketService` and the router both receive dependencies via constructor/factory. Both are independently testable.

**Config discipline**: Never import `process.env` in service or component files. Backend config lives in `src/config/`. No hardcoded URLs anywhere.

**Demo vs Production**: `src/config/demoConfig.ts` controls mode via `APP_MODE` env var. Demo = Mailtrap sandbox (emails never leave Mailtrap). Production = real SMTP (configure in `createProductionTransporter()`).

**CID email attachments**: The QR PNG is embedded in emails as a MIME attachment with a Content-ID, not as a base64 data URI. The HTML template references it via `<img src="cid:ticket-qr@gamesummit">`. Better email-client compatibility.

**Race condition note**: `verifyTicket()` does check-then-update in two steps. Safe for a single-process prototype. In production: use one atomic `UPDATE ... WHERE status='ACTIVE' RETURNING *` DB query.

**CSS Modules**: All React component styles use `.module.css`. Class names are locally scoped by Vite at build time. The `client/src/declarations.d.ts` file provides the TypeScript type for these imports.

**Vite proxy**: In development, Vite forwards `/api/*` requests to `http://localhost:3001`. No CORS issues in dev. In production, configure your reverse proxy (Nginx/ALB) the same way.

## Environment Variables

Copy `.env.example` to `.env`. All vars have safe defaults for local dev.

| Variable | Default | Purpose |
|---|---|---|
| `APP_MODE` | `demo` | `demo` = Mailtrap sandbox, `production` = real SMTP |
| `API_BASE_URL` | `https://api.event.com` | Embedded in ticket verification URLs |
| `API_VERSION` | `v1` | URL path prefix |
| `MARKETING_URL` | `https://event.com/register` | Stand QR code target |
| `OUTPUT_DIR` | `./output` | Where QR PNG files are saved |
| `PORT` | `3001` | Express server port |
| `MAILTRAP_SMTP_USER` | _(required for email)_ | From Mailtrap → Inboxes → SMTP Settings |
| `MAILTRAP_SMTP_PASS` | _(required for email)_ | From Mailtrap → Inboxes → SMTP Settings |
| `MAILTRAP_API_TOKEN` | _(production only)_ | Mailtrap live sending API token |
| `EMAIL_FROM` | `tickets@gamesummit.dev` | Sender address |

## Dependencies

### Backend
- `express` + `cors` — HTTP server
- `nodemailer` — SMTP email sending
- `qrcode` — QR generation
- `jimp` — Logo overlay on stand QRs
- `uuid` — Ticket ID generation
- `zod` — Request body validation
- `dotenv` — `.env` file loading

### Frontend
- `react` + `react-dom` — UI
- `vite` + `@vitejs/plugin-react` — Dev server + bundler
- `zod` — Form validation (same library, separate install)
