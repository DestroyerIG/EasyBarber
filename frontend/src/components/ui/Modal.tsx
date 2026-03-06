'use client';

import { X, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, icon: Icon, children, footer }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-dark-light border-b border-white/10 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="text-primary" size={20} />
                </div>
              )}
              <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-all"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="sticky bottom-0 bg-dark-light border-t border-white/10 p-6 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  disabled?: boolean;
}

export function ModalFooter({ onCancel, onSubmit, submitLabel, submitIcon: SubmitIcon, submitting, disabled }: ModalFooterProps) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onCancel}
        className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 font-medium transition-all"
      >
        Cancelar
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting || disabled}
        className="flex-1 btn-primary flex items-center justify-center gap-2"
      >
        {submitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            {SubmitIcon && <SubmitIcon size={18} />}
            {submitLabel}
          </>
        )}
      </button>
    </div>
  );
}
