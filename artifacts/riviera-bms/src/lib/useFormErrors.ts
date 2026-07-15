import { useState, useCallback } from "react";

// Lightweight inline form validation (forms-polish batch). Each form declares a
// rules function that returns { field: "message" } for whatever is invalid;
// validate() stores those, focuses the first offending field (by id), and
// returns whether the form is clear to submit. Errors clear per-field as the
// user edits, and reset() clears them when a dialog reopens.
export type FormErrors = Record<string, string>;

export function useFormErrors() {
  const [errors, setErrors] = useState<FormErrors>({});

  const reset = useCallback(() => setErrors({}), []);

  // Drop one field's error (call from a field's onChange so the message clears
  // as soon as the user starts fixing it).
  const clear = useCallback((field: string) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }, []);

  // Run the rules; on failure, focus the first invalid field (by DOM id) and
  // return false. Returns true when there are no errors.
  const validate = useCallback((rules: FormErrors) => {
    const next: FormErrors = {};
    for (const [k, v] of Object.entries(rules)) if (v) next[k] = v;
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      if (typeof document !== "undefined") {
        requestAnimationFrame(() => document.getElementById(first)?.focus());
      }
      return false;
    }
    return true;
  }, []);

  return { errors, validate, clear, reset };
}
