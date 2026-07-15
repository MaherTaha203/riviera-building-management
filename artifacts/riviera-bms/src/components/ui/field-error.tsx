// Inline validation message shown under a form field. Renders nothing when
// there's no error, so it can be dropped after any field unconditionally.
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{msg}</p>;
}
