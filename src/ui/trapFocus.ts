/**
 * trapFocus — a Svelte action for modal dialogs and popovers.
 *
 * The app's dialogs claimed `aria-modal="true"` but nothing moved focus in,
 * trapped Tab, or restored focus on close, so for keyboard/screen-reader users
 * the dialogs effectively didn't exist (ux-ui M3). Apply this to the dialog's
 * root element; it's a no-op for mouse users.
 *
 * Because it's used on `{#if open}`-mounted elements, the action's lifetime is
 * exactly the open lifetime: it focuses in on mount (open) and restores the
 * invoker on destroy (close). Escape-to-close is already wired per-dialog.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(node: HTMLElement) {
  // Remember who opened us so focus can return there on close.
  const invoker = document.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] =>
    Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      // Skip hidden controls (e.g. a popover not yet laid out).
      .filter((el) => el.offsetParent !== null || el === document.activeElement);

  // Move focus into the dialog: first control, else the dialog container (which
  // needs tabindex="-1" to receive it). Deferred a tick so the element is laid
  // out and any autofocus-y child has settled.
  queueMicrotask(() => {
    const first = focusables()[0];
    (first ?? node).focus({ preventScroll: true });
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const els = focusables();
    if (els.length === 0) {
      e.preventDefault();
      node.focus({ preventScroll: true });
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === node) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  node.addEventListener("keydown", onKeydown);

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
      // Restore focus to the opener if it's still in the document.
      if (invoker && invoker.isConnected) invoker.focus({ preventScroll: true });
    },
  };
}
