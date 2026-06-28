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
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      // Always parse the JSON regardless of HTTP status code.
      // Our API always returns structured JSON, even for errors.
      const result: RegistrationResponse = await response.json() as RegistrationResponse;

      if (!response.ok || !result.success) {
        // Type narrowing: TypeScript knows result is RegistrationErrorResponse here
        setState({
          status: 'error',
          message: result.message ?? 'Registration failed. Please try again.',
        });
        return;
      }

      // Type narrowing: TypeScript knows result is RegistrationSuccessResponse here
      setState({
        status: 'success',
        ticketId: result.ticketId,
        email: data.email,
        emailMode: result.emailMode,
        mailtrapUrl: result.mailtrapUrl,
      });

    } catch (err: unknown) {
      // Network error (server down, no internet, etc.)
      const message =
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Could not reach the server. Is the API running on port 3001?';

      setState({ status: 'error', message });
    }
  }, []);

  /** Resets to idle — lets the user try again after an error */
  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, submitRegistration, reset };
}
