import { useEffect, useRef } from "react";

export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  function keepFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter(control => control.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (first && event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (last && !event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}>Close</button></div>
    {children}
  </dialog>;
}
