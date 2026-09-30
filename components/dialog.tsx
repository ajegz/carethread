'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, description, onClose, children, wide = false }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const prior = document.activeElement as HTMLElement | null;
    el?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el?.close();
      document.body.style.overflow = oldOverflow;
      prior?.focus();
    };
  }, []);
  return <dialog ref={ref} className={`app-dialog ${wide ? 'dialog-wide' : ''}`}
    aria-labelledby="dialog-title" aria-describedby={description ? 'dialog-description' : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-heading">
      <div><p className="eyebrow">CARETHREAD WORKSPACE</p><h2 id="dialog-title">{title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
    </div>
    {description && <p className="dialog-description" id="dialog-description">{description}</p>}
    {children}
  </dialog>;
}
