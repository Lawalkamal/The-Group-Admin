'use client';

import { useEffect } from 'react';
import { Close } from './icons';

type Props = {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Sheet({ title, kicker, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section className="sheet">
        <header className="sheet__head">
          <div>
            {kicker ? <span className="eyebrow">{kicker}</span> : null}
            <h2 className="sheet__title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer ? <footer className="sheet__foot">{footer}</footer> : null}
      </section>
    </div>
  );
}
