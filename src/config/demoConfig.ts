/**
 * src/config/demoConfig.ts — Demo / Production Mode Switch
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  HOW MAILTRAP SANDBOX WORKS (and why it's safe for demos)            │
 * │                                                                       │
 * │  Normal email flow:  your app → real SMTP → recipient's mail server  │
 * │  Mailtrap demo flow: your app → Mailtrap SMTP → Mailtrap web inbox   │
 * │                                                                       │
 * │  Mailtrap's server accepts the email exactly as a real SMTP would,   │
 * │  but instead of doing a DNS/MX lookup and forwarding to the actual   │
 * │  recipient, it stores the email in your private Mailtrap inbox.      │
 * │                                                                       │
 * │  This means you can send to "attendee@example.com" on a laptop at    │
 * │  a trade-show and the email will appear in YOUR Mailtrap dashboard   │
 * │  — never touching example.com's mail servers. Zero spam risk.        │
 * │                                                                       │
 * │  When you're ready for real delivery, switch to APP_MODE=production  │
 * │  and configure a transactional provider (SendGrid, SES, etc.) or     │
 * │  Mailtrap's own "Email Sending" product (their live delivery API).   │
 * └───────────────────────────────────────────────────────────────────────┘
 */

export enum AppMode {
  DEMO = 'demo',
  PRODUCTION = 'production',
}

export const demoConfig = {
  /**
   * Switch between demo and production.
   * Set APP_MODE=production in .env when you're ready for live sending.
   * Defaults to 'demo' so the app is safe to run without any credentials set.
   */
  mode: (process.env.APP_MODE ?? 'demo') as AppMode,

  mailtrap: {
    /**
     * SANDBOX SMTP — used in DEMO mode.
     *
     * Where to get these credentials:
     *   Mailtrap Dashboard
     *     → Email Testing (left sidebar)
     *     → Inboxes
     *     → Click your inbox name
     *     → "Show Credentials" under SMTP Settings
     *     → Copy "Username" → MAILTRAP_SMTP_USER
     *     → Copy "Password" → MAILTRAP_SMTP_PASS
     *
     * The host and port below are Mailtrap's standard sandbox values.
     * Port 2525 uses STARTTLS (upgrade-in-place). Port 465 uses SSL-on-connect.
     */
    smtp: {
      host: process.env.MAILTRAP_SMTP_HOST ?? 'sandbox.smtp.mailtrap.io',
      port: parseInt(process.env.MAILTRAP_SMTP_PORT ?? '2525', 10),
      user: process.env.MAILTRAP_SMTP_USER ?? '',
      pass: process.env.MAILTRAP_SMTP_PASS ?? '',
    },

    /**
     * PRODUCTION API TOKEN — used when APP_MODE=production.
     * For Mailtrap's live sending service ("Email Sending" in dashboard).
     * For other providers (SendGrid, SES), configure in emailService.ts directly.
     */
    apiToken: process.env.MAILTRAP_API_TOKEN ?? '',
  },

  email: {
    /**
     * The visible "From" address on outgoing emails.
     * In production, this domain must be verified with your email provider.
     * In sandbox (demo), any value works — Mailtrap doesn't validate senders.
     */
    from: process.env.EMAIL_FROM ?? 'tickets@gamesummit.dev',
    fromName: process.env.EMAIL_FROM_NAME ?? 'Game Summit 2026',
  },
} as const;

/** Convenience predicate used throughout the codebase. */
export const isDemo = (): boolean => demoConfig.mode === AppMode.DEMO;
