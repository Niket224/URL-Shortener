import { useEffect, useRef } from "react";

export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2>{title}</h2><button aria-label="Close dialog" onClick={onClose}>Close</button></div>
    {children}
  </dialog>;
}
