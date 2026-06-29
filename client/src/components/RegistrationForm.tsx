/**
 * client/src/components/RegistrationForm.tsx — Registration Form
 *
 * Handles the UI and local field state for the registration form.
 * API calls and submission state live in the useRegistration hook.
 *
 * STATE OWNERSHIP:
 * - Local (this component):  email string, checkbox value, field-level error
 * - External (hook):         submission lifecycle (idle / loading / success / error)
 *
 * VALIDATION STRATEGY:
 * - On field blur:  validate the email with Zod, show error immediately
 * - On submit:      run full Zod parse; block submit if invalid
 * - On success/err: delegated entirely to the hook's state machine
 *
 * ACCESSIBILITY:
 * - aria-invalid on the input when there's an error
 * - aria-describedby linking the input to its error message
 * - Role and live region for the success panel
 * - All interactive elements keyboard-navigable
 */

import { useState, useId, FormEvent } from 'react';
import s from './RegistrationForm.module.css';
import { useRegistration } from '../hooks/useRegistration';
import { registrationSchema, validateEmailField } from '../validation/registrationSchema';

export default function RegistrationForm() {
  // ── Local field state ──────────────────────────────────────────────────
  const [email, setEmail]                   = useState('');
  const [emailError, setEmailError]         = useState<string | null>(null);
  const [subscribed, setSubscribed]         = useState(false);
  const [hasBlurred, setHasBlurred]         = useState(false); // Only show errors after first blur

  // ── Submission state (from hook) ───────────────────────────────────────
  const { state, submitRegistration, reset } = useRegistration();
  const isLoading                            = state.status === 'loading';

  // ── Accessibility IDs (useId generates stable, unique IDs per component) ─
  const emailId      = useId();
  const emailErrorId = useId();

  // ── Event Handlers ────────────────────────────────────────────────────
  function handleEmailBlur() {
    setHasBlurred(true);
    setEmailError(validateEmailField(email));
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    // Once the user has blurred and seen an error, update it as they type
    if (hasBlurred) {
      setEmailError(validateEmailField(value));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Final client-side validation before sending to the API
    const result = registrationSchema.safeParse({ email, subscribedToMailingList: subscribed });
    if (!result.success) {
      setEmailError(result.error.flatten().fieldErrors.email?.[0] ?? null);
      setHasBlurred(true);
      return;
    }

    await submitRegistration(result.data);
  }

  // ── Render: Success State ─────────────────────────────────────────────
  if (state.status === 'success') {
    return (
      <div
        className={s.successPanel}
        role="status"
        aria-live="polite"
        aria-label="Registration successful"
      >
        <div className={s.successIcon} aria-hidden="true">✓</div>

        <span className={s.successBadge}>
          <span>■</span> Access Granted
        </span>

        <h2 className={s.successTitle}>Ticket Dispatched</h2>

        <p className={s.successEmail}>{state.email}</p>

        {/* Show the Ticket ID so the attendee can reference it */}
        <div className={s.ticketIdBlock}>
          <span className={s.ticketIdLabel}>Ticket ID</span>
          <span className={s.ticketIdValue}>{state.ticketId}</span>
        </div>

        <p className={s.successNote}>
          {state.emailMode === 'demo' ? (
            <>
              Running in <strong className={s.mailtrapLink} style={{ textDecoration: 'none' }}>demo mode</strong>.
              Your email is in the{' '}
              <a
                href={state.mailtrapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={s.mailtrapLink}
              >
                Mailtrap inbox
              </a>
              {' '}— it was never delivered to a real address.
            </>
          ) : (
            'Your digital ticket has been sent. Check your inbox and present the QR code at entry.'
          )}
        </p>

        <button
          className={s.newRegistrationBtn}
          onClick={reset}
          type="button"
        >
          Register Another
        </button>
      </div>
    );
  }

  // ── Render: Form (idle / loading / error states) ──────────────────────
  return (
    <>
      <p className={s.formTitle}>Secure Your Pass</p>

      <form
        className={s.form}
        onSubmit={handleSubmit}
        noValidate  /* Disable browser native validation — we handle it with Zod */
        aria-label="Event registration form"
      >
        {/* ── Email Field ─────────────────────────────────────────────── */}
        <div className={s.field}>
          <label htmlFor={emailId} className={s.label}>
            Email Address
          </label>
          <input
            id={emailId}
            type="email"
            className={`${s.input} ${emailError ? s.hasError : ''}`}
            value={email}
            placeholder="your@email.com"
            onChange={e => handleEmailChange(e.target.value)}
            onBlur={handleEmailBlur}
            disabled={isLoading}
            required
            autoComplete="email"
            aria-invalid={emailError ? 'true' : 'false'}
            aria-describedby={emailError ? emailErrorId : undefined}
          />
          {emailError && (
            <span id={emailErrorId} className={s.fieldError} role="alert">
              {emailError}
            </span>
          )}
        </div>

        {/* ── Mailing List Checkbox ────────────────────────────────────── */}
        <label className={s.checkboxField}>
          {/*
            Hidden native checkbox: receives focus, responds to keyboard,
            is read by screen readers. The visual .checkboxBox is driven
            by CSS :checked on this input (adjacent sibling selector).
          */}
          <input
            type="checkbox"
            className={s.checkboxInput}
            checked={subscribed}
            onChange={e => setSubscribed(e.target.checked)}
            disabled={isLoading}
            aria-label="Subscribe to mailing list for exclusive game updates"
          />
          <span className={s.checkboxBox} aria-hidden="true">
            {/* The tick is toggled via CSS :checked, but we also pass a class
                for the cases where CSS custom checkbox doesn't fully propagate */}
            <span className={`${s.checkboxTick} ${subscribed ? s.visible : ''}`}>
              ✓
            </span>
          </span>
          <span className={s.checkboxLabel}>
            Join the mailing list for{' '}
            <strong>exclusive game updates</strong> and early access news.
          </span>
        </label>

        {/* ── API Error Banner ─────────────────────────────────────────── */}
        {state.status === 'error' && (
          <div className={s.errorBanner} role="alert">
            <span className={s.errorBannerIcon} aria-hidden="true">⚠</span>
            <div>
              <p className={s.errorBannerText}>{state.message}</p>
              <button
                type="button"
                className={s.retryLink}
                onClick={reset}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Submit Button ────────────────────────────────────────────── */}
        <button
          type="submit"
          className={s.submitButton}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              Processing
              <span className={s.loadingDots} aria-hidden="true">
                <span /><span /><span />
              </span>
            </>
          ) : (
            'Register: Get Your Ticket'
          )}
        </button>

      </form>
    </>
  );
}
