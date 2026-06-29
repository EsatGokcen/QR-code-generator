/**
 * client/src/hooks/useRegistration.ts — Registration State & API Hook
 *
 * SEPARATION OF CONCERNS:
 * This hook owns all the async logic and state for the registration flow.
 * The form component (RegistrationForm.tsx) owns only the local field state
 * (email string, checkbox value, field error messages).
 *
 * WHY SPLIT THIS WAY?
 * A component that directly fetches data, manages loading states, handles
 * errors, AND renders JSX violates the Single Responsibility Principle.
 * Custom hooks let you extract the non-rendering concerns. The component
 * becomes a pure consumer of state — much easier to read and test.
 *
 * This hook is also reusable: any component can call useRegistration()
 * to trigger the same flow with the same state machine.
 */

import { useState, useCallback } from 'react';
import { RegistrationFormData } from '../validation/registrationSchema';
import { SubmissionState, RegistrationResponse } from '../types';

export function useRegistration() {
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });

  /**
   * Submits the registration form to the backend.
   *
   * useCallback memoises the function reference. Without it, a new function
   * is created on every render, which would cause child components that
   * receive it as a prop to re-render unnecessarily. The empty dependency
   * array means the function is created once and never recreated.
   */
  const submitRegistration = useCallback(async (data: RegistrationFormData) => {
    setState({ status: 'loading' });

    try {
      // Relative URL — resolves correctly whether the page is loaded from
      // localhost:5173 in development or a Pinggy/ngrok tunnel on mobile.
      // Never use an absolute http://localhost:3001 URL here: that resolves
      // to the laptop's loopback on desktop but fails entirely on a phone.
      // Vite proxies /api/* → http://localhost:3001 on the server side.
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      // Always parse the JSON body regardless of HTTP status.
      // Our API returns structured JSON even for 4xx/5xx responses.
      const result: RegistrationResponse = await response.json() as RegistrationResponse;

      if (!response.ok || !result.success) {
        setState({
          status: 'error',
          message: result.message ?? 'Registration failed. Please try again.',
        });
        return;
      }

      setState({
        status: 'success',
        ticketId: result.ticketId,
        email: data.email,
        emailMode: result.emailMode,
        mailtrapUrl: result.mailtrapUrl,
      });

    } catch (err: unknown) {
      // Covers genuine network failures: tunnel disconnected, server down,
      // SSL errors, and WebKit DOMExceptions from failed host-verification
      // responses that Safari can't parse as JSON.
      // We intentionally do NOT surface err.message directly — on mobile
      // WebKit it reads as "The string did not match the expected pattern."
      // which is a Safari-internal DOMException, not a user-actionable message.
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[Registration] Fetch failed:', detail);

      setState({
        status: 'error',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }
  }, []);

  /** Resets to idle — lets the user try again after an error */
  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, submitRegistration, reset };
}
