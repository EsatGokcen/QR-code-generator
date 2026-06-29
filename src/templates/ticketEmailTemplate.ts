/**
 * src/templates/ticketEmailTemplate.ts — HTML Email Template
 *
 * Produces the HTML (and plain-text fallback) for the ticket confirmation email.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  WHY CID ATTACHMENTS INSTEAD OF BASE64 OR HOSTED IMAGES?              │
 * │                                                                         │
 * │  Three ways to embed an image in an email:                             │
 * │                                                                         │
 * │  1. Hosted URL:  <img src="https://cdn.event.com/qr/ticket-123.png">   │
 * │     Requires a CDN/S3 bucket. Blocked by "don't load remote images".   │
 * │                                                                         │
 * │  2. Base64 data URI:  <img src="data:image/png;base64,iVBOR...">       │
 * │     No CDN needed, but adds ~33% size overhead and many email clients   │
 * │     (Outlook) strip base64 images as a security measure.               │
 * │                                                                         │
 * │  3. CID (Content-ID) attachment — what we use:                         │
 * │     The image travels inside the email itself as a MIME attachment.    │
 * │     The HTML references it with <img src="cid:ticket-qr@event">.      │
 * │     The nodemailer attachment has { cid: 'ticket-qr@event' }.         │
 * │     The email client stitches them together for display.               │
 * │                                                                         │
 * │  CID is the industry standard for inline ticket images. It works in    │
 * │  Gmail, Outlook, Apple Mail, and mobile clients even with "block        │
 * │  external images" enabled — because the image is part of the email.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * EMAIL CSS NOTE:
 * Email clients have notoriously poor CSS support. Rules of thumb:
 * - No flexbox or grid (Outlook ignores them entirely)
 * - No CSS custom properties / variables
 * - Inline or <style> block only (no external stylesheets)
 * - Tables are still the most reliable layout tool
 * - Always include a text/plain fallback
 */

export interface TicketEmailData {
  attendeeName?: string;    // Optional — falls back to email username
  attendeeEmail: string;
  ticketId: string;
  eventName: string;        // e.g. 'Game Summit 2026'
  eventDate: string;        // e.g. 'July 15–17, 2026 · ExCeL London'
  verifyUrl: string;        // Full ticket verification URL
}

/**
 * The CID identifier that links the HTML <img> to the nodemailer attachment.
 * This value MUST match the `cid` field in the attachments array in emailService.ts.
 * Think of it like an anchor href — both sides must reference the same string.
 */
export const TICKET_QR_CID = 'ticket-qr@gamesummit';

export function buildTicketEmailHtml(data: TicketEmailData): string {
  // Capitalise the first character of whatever name we display.
  // e.g. "esat_gokcen" → "Esat_gokcen", "playerone" → "Playerone"
  // If attendeeName was provided at registration that is used directly (with
  // the same capitalisation rule applied for consistency).
  const rawName     = data.attendeeName ?? data.attendeeEmail.split('@')[0];
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Your Ticket — ${data.eventName}</title>
  <style type="text/css">
    /*
      EMAIL CSS RULES:
      - No flexbox / grid   (Outlook ignores both)
      - No CSS variables    (only inline or <style> block)
      - No external fonts   (use web-safe font stacks only)
      - No text-shadow      (stripped by many clients)
      Tables remain the most reliable layout primitive across all clients.
    */

    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; }

    body {
      margin: 0;
      padding: 0;
      background-color: #00091f;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    }

    /* ── Page wrapper ── */
    .wrapper   { width: 100%; background-color: #00091f; padding: 32px 0; }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #001040;
      border-top: 4px solid #00a0e9;   /* Sega electric-blue top rail */
    }

    /* ── HEADER ── */
    .header {
      background-color: #001040;
      border-bottom: 2px solid #0054a6;
      padding: 40px 36px 32px;
      text-align: center;
    }
    .header-badge {
      display: inline-block;
      background-color: #00a0e9;
      color: #000000;
      font-family: 'Arial Black', Impact, Arial, sans-serif;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 4px;
      padding: 6px 18px;
      margin-bottom: 22px;
      text-transform: uppercase;
    }
    .header-title {
      color: #ffffff;
      font-family: 'Arial Black', Impact, Arial, sans-serif;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0 0 8px 0;
    }
    .header-subtitle {
      color: #a8cce8;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 4px;
      text-transform: uppercase;
      margin: 0;
    }

    /* ── BODY ── */
    .body    { padding: 36px 36px 24px; }
    .greeting {
      color: #ffffff;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 12px 0;
    }
    .greeting-name { color: #00a0e9; }
    .intro {
      color: #a8cce8;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 15px;
      line-height: 1.75;
      margin: 0 0 32px 0;
    }

    /* ── TICKET CARD ── */
    .ticket-card {
      background-color: #000c33;
      border: 2px solid #0054a6;
      border-top: 4px solid #00a0e9;
      padding: 28px;
      margin-bottom: 28px;
    }
    .ticket-label {
      color: #00a0e9;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin: 0 0 22px 0;
    }

    /* ── QR CODE ── */
    .qr-wrapper { text-align: center; padding: 16px 0; }
    .qr-wrapper img {
      display: block;
      margin: 0 auto;
      width: 200px;
      height: 200px;
      border: 3px solid #00a0e9;
      padding: 12px;
      background: #ffffff;
    }
    .qr-caption {
      color: #507090;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 3px;
      text-align: center;
      margin: 12px 0 0 0;
      text-transform: uppercase;
    }

    /* ── TICKET DETAILS ── */
    .divider { border: none; border-top: 1px solid #0054a6; margin: 22px 0; }
    .detail-label {
      color: #a8cce8;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      display: block;
      margin-bottom: 4px;
    }
    .detail-value {
      color: #ffffff;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 16px 0;
    }
    .detail-value-mono {
      color: #00a0e9;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      word-break: break-all;
      line-height: 1.6;
    }

    /* ── WARNING ── */
    .warning {
      border-left: 4px solid #ff3333;
      background-color: #1a0008;
      padding: 14px 18px;
      margin-bottom: 28px;
    }
    .warning p {
      color: #ff8888;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      font-weight: 600;
      margin: 0;
      line-height: 1.65;
    }

    /* ── CTA BUTTON ── */
    .cta-button {
      display: block;
      background-color: #00a0e9;
      color: #000000;
      text-align: center;
      padding: 16px;
      text-decoration: none;
      font-family: 'Arial Black', Impact, Arial, sans-serif;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 4px;
      text-transform: uppercase;
      margin-bottom: 28px;
    }

    /* ── FOOTER ── */
    .footer {
      border-top: 2px solid #0054a6;
      padding: 22px 36px;
      text-align: center;
      background-color: #00091f;
    }
    .footer p {
      color: #507090;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      margin: 0 0 5px 0;
      line-height: 1.6;
    }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="container">

    <!-- ═══ HEADER ════════════════════════════════════════════════ -->
    <div class="header">
      <div class="header-badge">&#9632; Access Granted</div>
      <h1 class="header-title">${data.eventName}</h1>
      <p class="header-subtitle">Digital Event Pass</p>
    </div>

    <!-- ═══ BODY ══════════════════════════════════════════════════ -->
    <div class="body">

      <h2 class="greeting">
        Welcome, <span class="greeting-name">${displayName}</span>.
      </h2>
      <p class="intro">
        Your ticket has been confirmed and is encoded in the QR code below.
        Present it at the venue entrance — our scanners process it instantly.
        Each ticket is single-use; a second scan triggers an immediate alert.
      </p>

      <!-- ── TICKET CARD ───────────────────────────────────────── -->
      <div class="ticket-card">
        <p class="ticket-label">Your Entry Pass</p>

        <!--
          CID image reference: the email client looks for an attachment
          whose Content-ID matches "${TICKET_QR_CID}". Nodemailer wires
          this automatically via the { cid } field in emailService.ts.
          Works in Gmail, Outlook, Apple Mail, and mobile clients even
          when "block external images" is enabled.
        -->
        <div class="qr-wrapper">
          <img
            src="cid:${TICKET_QR_CID}"
            alt="Your Event Ticket QR Code — scan at venue entrance"
            width="200"
            height="200"
          />
          <p class="qr-caption">Scan at venue entry &middot; Single use</p>
        </div>

        <hr class="divider" />

        <span class="detail-label">Ticket ID</span>
        <p class="detail-value">
          <span class="detail-value-mono">${data.ticketId}</span>
        </p>

        <span class="detail-label">Registered Email</span>
        <p class="detail-value">${data.attendeeEmail}</p>

        <span class="detail-label">Event</span>
        <p class="detail-value" style="margin-bottom:0">${data.eventDate}</p>
      </div>

      <!-- ── SECURITY WARNING ──────────────────────────────────── -->
      <div class="warning">
        <p>
          &#9888; Do not share this QR code. It is uniquely tied to your
          registration and can only be scanned once. Duplicate scans are
          flagged as potential fraud.
        </p>
      </div>

      <!-- ── CTA BUTTON ────────────────────────────────────────── -->
      <a href="${data.verifyUrl}" class="cta-button">View Ticket Status Online</a>

    </div><!-- /body -->

    <!-- ═══ FOOTER ════════════════════════════════════════════════ -->
    <div class="footer">
      <p>${data.eventName} &middot; Digital Ticketing System</p>
      <p>You received this email because you registered at an event stand.</p>
    </div>

  </div><!-- /container -->
</div><!-- /wrapper -->
</body>
</html>`;
}

/**
 * Plain-text fallback — always include one.
 * Some clients (strict corporate email gateways) strip HTML entirely.
 * A clean text version ensures the attendee always gets their ticket ID.
 */
export function buildTicketEmailText(data: TicketEmailData): string {
  const rawName     = data.attendeeName ?? data.attendeeEmail.split('@')[0];
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return [
    `${data.eventName} — Your Digital Event Pass`,
    '='.repeat(48),
    '',
    `Welcome, ${displayName}.`,
    '',
    'Your ticket is confirmed. Your unique QR code is attached to this email.',
    'Present it at the venue entrance to gain entry.',
    '',
    `Ticket ID  : ${data.ticketId}`,
    `Email      : ${data.attendeeEmail}`,
    `Event      : ${data.eventDate}`,
    '',
    'IMPORTANT: This QR code is single-use. Do not forward this email.',
    '',
    `Check ticket status: ${data.verifyUrl}`,
    '',
    '---',
    `${data.eventName} · Digital Ticketing System`,
  ].join('\n');
}
