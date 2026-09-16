'use client';

import { useEffect, useRef } from 'react';

type RulesDialogProps = {
  open: boolean;
  gameName: string;
  rules: string[];
  onClose: () => void;
};

export function RulesDialog({ open, gameName, rules, onClose }: RulesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
      previousFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="rules-dialog"
      aria-labelledby="rules-dialog-title"
      onClose={onClose}
    >
      <div className="rules-dialog-head">
        <div>
          <span className="panel-kicker">HOW TO PLAY</span>
          <h2 id="rules-dialog-title">{gameName} rules</h2>
        </div>
        <button
          ref={closeButtonRef}
          className="dialog-close"
          type="button"
          aria-label="Close rules"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <ol className="rules-list">
        {rules.map((rule, index) => <li key={index}>{rule}</li>)}
      </ol>
      <div className="rules-dialog-actions">
        <button className="primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
