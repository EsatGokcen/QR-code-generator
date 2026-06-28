# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Run demo via ts-node (no build step required)
npm run build      # Compile TypeScript → dist/
npm start          # Run compiled output (requires build first)
npm run type-check # Type-check without emitting files
npm run clean      # Delete dist/ and output/
```

## Architecture

Node.js + TypeScript backend service. No frontend. No database (yet).

```
src/
├── config/index.ts          # All env-var-driven configuration; derive URLs here, nowhere else
├── types/index.ts           # All shared interfaces, enums, and types (single source of truth)
├── utils/idGenerator.ts     # Cryptographically secure ID generation (UUID v4 + crypto fallback)
├── repositories/
│   └── ticketRepository.ts  # ITicketRepository interface + InMemoryTicketRepository (mock)
├── services/
│   ├── qrService.ts         # Stateless QR image generation (PNG buffer + SVG string)
│   └── ticketService.ts     # Ticket business logic (create, verify); takes repository via constructor
└── index.ts                 # Composition root — wires dependencies; also the demo runner
```

## Key Design Rules

**Repository pattern**: `TicketService` depends on `ITicketRepository` (interface), not `InMemoryTicketRepository` (concrete). To add a real database, implement `ITicketRepository` and pass it to `TicketService`'s constructor in `index.ts` — the service itself needs no changes.

**Config discipline**: Never import `process.env` in service or repository files. All env access goes through `src/config/index.ts`. URL construction is done via the `urls` factory in that file.

**qrService is stateless**: It has no repository dependency and can be tested in isolation. It always generates both a PNG (saved to `config.output.dir`) and an SVG string.

**Error correction level H**: All QR codes use level H (30% recovery). Required because stand QRs support logo overlay — the logo covers ≤20% of the pattern and H-level correction recovers it.

**Race condition note**: `verifyTicket()` does check-then-update in two steps. Safe for single-process prototype. In production, replace with a single atomic `UPDATE ... WHERE status='ACTIVE' RETURNING *` query.

## Environment Variables

Copy `.env.example` to `.env`. Defaults work for local development without a `.env` file.

| Variable | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `https://api.event.com` | Base of ticket verification URLs |
| `API_VERSION` | `v1` | URL path prefix |
| `MARKETING_URL` | `https://event.com/register` | Stand QR code target |
| `OUTPUT_DIR` | `./output` | Where PNG files are saved |

## Dependencies

- `qrcode` — QR matrix generation and PNG/SVG rendering
- `jimp` — Pure-JS image processing for logo overlay on stand QRs
- `uuid` — UUID v4 ticket ID generation
