'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/Modal';

interface AdminConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  requireReason?: boolean;
}

export function AdminConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  submitting,
  onClose,
  onConfirm,
  requireReason = true,
}: AdminConfirmModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setReason('');
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={AlertTriangle}
      footer={(
        <ModalFooter
          onCancel={onClose}
          onSubmit={() => onConfirm(reason || undefined)}
          submitLabel={confirmLabel}
          submitting={submitting}
          disabled={requireReason && reason.trim().length < 3}
        />
      )}
    >
      <p className="text-sm text-gray-300">{description}</p>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Motivo</label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          className="input min-h-[110px] resize-y"
          placeholder="Descreva o motivo da ação"
        />
      </div>
    </Modal>
  );
}
