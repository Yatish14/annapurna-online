/**
 * After a form is refused because of invalid fields, puts the cursor in the first one (top of the form).
 * Every invalid field calls this from its "invalid" event; they all end up focusing the same field, the
 * first in the form, instead of whichever field happened to be checked last.
 */
export function focusFirstInvalid(field: HTMLInputElement) {
  window.setTimeout(() => {
    const fields = field.form ? Array.from(field.form.elements) : [];
    // .validity doesn't fire "invalid" events (checkValidity() would, and loop)
    const first = fields.find(
      (el): el is HTMLInputElement =>
        el instanceof HTMLElement && "validity" in el && (el as HTMLInputElement).willValidate && !(el as HTMLInputElement).validity.valid,
    );
    (first ?? field).focus();
  }, 0);
}
