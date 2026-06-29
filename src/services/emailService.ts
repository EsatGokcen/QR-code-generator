/**
 * src/services/emailService.ts — Email Delivery Service
 *
 * Sends the ticket confirmation email using Nodemailer.
 * Nodemailer is the de-facto standard Node.js email library — it wraps
 * SMTP protocol details behind a clean async API.
 *
 * ARCHITECTURE:
 * This service follows the Strategy pattern for transport selection:
 *   - DEMO mode  → createDemoTransporter()  (Mailtrap sandbox SMTP)
 *   - PRODUCTION → createProductionTransporter() (real provider)
 * The rest of the service (sendTicketEmail) is identical in both modes —
 * only the transport differs. This is Open/Closed Principle in practice.
 *
 * STATELESS DESIGN:
 * Like qrService, this service is stateless. It creates a transporter
 * on each call rather than caching one. For high-throughput systems,
 * enable Nodemailer's `pool: true` option to reuse SMTP connections.
 */

import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs/promises';
import { demoConfig, isDemo, AppMode } from '../config/demoConfig';
import {
  buildTicketEmailHtml,
  buildTicketEmailText,
  TicketEmailData,
  TICKET_QR_CID,
} from '../templates/ticketEmailTemplate';

// ─── Transport Factory ────────────────────────────────────────────────────────

/**
 * Creates a Nodemailer SMTP transporter pointed at Mailtrap's sandbox.
 *
 * A "transporter" is Nodemailer's connection object. It holds SMTP config
 * and manages the underlying TCP connection to the mail server.
 *
 * PORT CHOICE:
 * We use port 2525 with `secure: false` (STARTTLS). This means the
 * connection starts unencrypted and upgrades to TLS mid-handshake.
 * Port 465 with `secure: true` would use SSL from the start — both work
 * with Mailtrap. 2525 is more firewall-friendly.
 */
function createDemoTransporter(): Transporter {
  const { smtp } = demoConfig.mailtrap;

  if (!smtp.user || !smtp.pass) {
    throw new Error(
      'Mailtrap sandbox credentials are missing.\n\n' +
      'To fix:\n' +
      '  1. Log in at https://mailtrap.io\n' +
      '  2. Go to Email Testing → Inboxes → [your inbox] → SMTP Settings\n' +
      '  3. Copy Username → MAILTRAP_SMTP_USER in your .env\n' +
      '  4. Copy Password → MAILTRAP_SMTP_PASS in your .env\n'
    );
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false, // STARTTLS (not SSL-on-connect) — correct for port 2525
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },

    // ── SMTP Timeouts ──────────────────────────────────────────────────────
    // Without these, a dead or slow SMTP server causes the sendMail() promise
    // to hang indefinitely, blocking the Express response forever.
    //
    // connectionTimeout: time (ms) to establish the initial TCP connection.
    //   If sandbox.smtp.mailtrap.io is unreachable, this fires in 10s.
    //
    // greetingTimeout: time (ms) to receive the SMTP server's opening banner
    //   ("220 mailtrap.io ESMTP ..."). If the server connects but stalls, this fires.
    //
    // socketTimeout:   time (ms) of inactivity on an already-open socket
    //   during the DATA phase. Guards against a server that accepts the message
    //   but never acknowledges it.
    //
    // All three ensure errors are surfaced as promise rejections (caught by our
    // try/catch) rather than as uncaughtException from abandoned socket events.
    connectionTimeout: 10_000,
    greetingTimeout:    8_000,
    socketTimeout:     15_000,
  });
}

/**
 * EXTENSION POINT: configure your real transactional email provider here.
 *
 * Mailtrap Live (recommended — same dashboard, real delivery):
 *   host: 'live.smtp.mailtrap.io', port: 587,
 *   auth: { user: 'api', pass: process.env.MAILTRAP_API_TOKEN }
 *
 * SendGrid:
 *   host: 'smtp.sendgrid.net', port: 587,
 *   auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
 *
 * AWS SES:
 *   host: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`, port: 587,
 *   auth: { user: process.env.SES_SMTP_USER, pass: process.env.SES_SMTP_PASS }
 */
function createProductionTransporter(): Transporter {
  const token = demoConfig.mailtrap.apiToken;
  if (!token) {
    throw new Error(
      'Production mode requires MAILTRAP_API_TOKEN (or a different provider config).\n' +
      'See createProductionTransporter() in emailService.ts for provider examples.'
    );
  }
  // Default production path: Mailtrap's live sending API (real delivery)
  return nodemailer.createTransport({
    host: 'live.smtp.mailtrap.io',
    port: 587,
    secure: false,
    auth: {
      user: 'api',
      pass: token,
    },
    connectionTimeout: 10_000,
    greetingTimeout:    8_000,
    socketTimeout:     15_000,
  });
}

function getTransporter(): Transporter {
  return isDemo() ? createDemoTransporter() : createProductionTransporter();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SendTicketEmailParams {
  emailData: TicketEmailData;
  qrCodePath: string; // Absolute filesystem path to the ticket's .png file
}

export interface SendTicketEmailResult {
  messageId: string;
  mode: AppMode;
  mailtrapInboxUrl: string; // Where to view the email (demo mode)
}

/**
 * Sends a ticket confirmation email with the QR code as a CID attachment.
 *
 * FLOW:
 * 1. Validate the QR PNG file exists (fail clearly before SMTP connection)
 * 2. Select the appropriate transporter (demo vs production)
 * 3. Build the email (HTML body + text fallback + CID attachment)
 * 4. Send via Nodemailer and return the result
 *
 * CID ATTACHMENT MECHANICS:
 * The PNG file is read by Nodemailer and attached to the email as a
 * MIME part with a Content-ID header set to TICKET_QR_CID.
 * The HTML template references it as <img src="cid:[TICKET_QR_CID]">.
 * The email client matches the CID to the attachment and renders inline.
 * This all happens inside the email — no CDN, no HTTP request needed.
 *
 * @param params.emailData   - Template variables
 * @param params.qrCodePath  - Absolute path to the generated QR PNG
 */
export async function sendTicketEmail(
  params: SendTicketEmailParams
): Promise<SendTicketEmailResult> {
  const { emailData, qrCodePath } = params;

  // Pre-flight: check the QR file is accessible before opening an SMTP connection.
  // fs.access() checks file existence + read permissions without reading the file.
  try {
    await fs.access(qrCodePath);
  } catch {
    throw new Error(
      `Cannot attach QR code — file not found: "${qrCodePath}".\n` +
      `Ensure generateTicketQr() completed successfully before calling sendTicketEmail().`
    );
  }

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"${demoConfig.email.fromName}" <${demoConfig.email.from}>`,
    to: emailData.attendeeEmail,
    subject: `🎮 Your ${emailData.eventName} Ticket is Ready`,

    // Both HTML and text are sent; the client chooses which to render.
    // Modern clients use HTML; corporate gateways or screen readers use text.
    html: buildTicketEmailHtml(emailData),
    text: buildTicketEmailText(emailData),

    attachments: [
      {
        filename: 'event-ticket-qr.png',

        // `path` tells Nodemailer to read the file from disk and attach it.
        // Alternative: use `content: Buffer` if you already have the bytes in memory.
        path: qrCodePath,

        // Content-ID — must EXACTLY match the `cid:` value in the HTML template.
        // This is the link that makes the email client display it inline.
        cid: TICKET_QR_CID,

        contentType: 'image/png',
      },
    ],
  });

  const messageId = typeof info.messageId === 'string' ? info.messageId : 'unknown';

  console.log(`[EmailService] ✓ Sent — Message-ID: ${messageId}`);
  if (isDemo()) {
    console.log('[EmailService] Demo mode: email is in your Mailtrap sandbox inbox.');
    console.log('[EmailService] → https://mailtrap.io/inboxes');
  }

  return {
    messageId,
    mode: demoConfig.mode,
    mailtrapInboxUrl: 'https://mailtrap.io/inboxes',
  };
}
