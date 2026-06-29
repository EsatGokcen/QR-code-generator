/**
 * client/src/components/LandingPage.tsx — Main Landing Page
 *
 * The page attendees see when they scan the event stand QR code.
 * Cyberpunk / gaming aesthetic: dark background, neon accents, glitch text.
 *
 * COMPONENT RESPONSIBILITY:
 * This component owns the page layout and visual structure.
 * Form state, validation, and API calls live in RegistrationForm + useRegistration.
 * This file only arranges elements on the page.
 */

import s from './LandingPage.module.css';
import RegistrationForm from './RegistrationForm';

export default function LandingPage() {
  return (
    <main className={s.page}>
      <div className={s.content}>

        {/* ── Event Badge ────────────────────────────────────────────── */}
        <div className={s.badge}>
          <span className={s.badgeDot} aria-hidden="true" />
          Game Summit 2026 · Live Registration
        </div>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className={s.hero} aria-labelledby="hero-headline">
          <p className={s.eyebrow}>Exclusive Access · July 2026</p>

          <h1 id="hero-headline" className={s.headline}>
            Claim Your<br />
            Event{' '}
            {/*
              .highlight applies the Sega electric-blue accent colour and a
              subtle glow — no animation. The contrast alone draws the eye.
            */}
            <span className={s.highlight}>LOOT</span>
          </h1>

          <p className={s.description}>
            Access <strong>exclusive game reveals</strong>, developer panels,
            and hands-on demos. Register below and your{' '}
            <strong>digital entry pass</strong> lands in your inbox instantly.
          </p>
        </section>

        {/* ── Registration Form Card ─────────────────────────────────── */}
        <div className={s.card} role="region" aria-label="Registration">
          {/* Corner bracket decorations — purely visual */}
          <span className={`${s.corner} ${s.cornerTL}`} aria-hidden="true" />
          <span className={`${s.corner} ${s.cornerTR}`} aria-hidden="true" />
          <span className={`${s.corner} ${s.cornerBL}`} aria-hidden="true" />
          <span className={`${s.corner} ${s.cornerBR}`} aria-hidden="true" />

          <RegistrationForm />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className={s.footer} aria-label="Page footer">
          <p className={s.footerText}>Single-use QR ticket · Issued instantly</p>
          <p className={s.footerText}>Game Summit 2026 · ExCeL London</p>
        </footer>

      </div>
    </main>
  );
}
