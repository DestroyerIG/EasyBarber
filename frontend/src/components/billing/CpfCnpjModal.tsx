'use client';

import { FileText, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui';

interface CpfCnpjModalProps {
  isOpen: boolean;
  value: string;
  errorMessage?: string | null;
  submitting?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CpfCnpjModal({
  isOpen,
  value,
  errorMessage,
  submitting = false,
  onChange,
  onClose,
  onSubmit,
}: CpfCnpjModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
      title="Informe CPF/CNPJ para Pix"
      icon={FileText}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-300">
          Para gerar cobrancas Pix via Asaas, precisamos do CPF ou CNPJ da barbearia.
        </p>

        <div>
          <label htmlFor="cpf-cnpj-input" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
            CPF ou CNPJ
          </label>
          <input
            id="cpf-cnpj-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            maxLength={18}
            className={[
              'w-full rounded-xl border bg-black/30 px-4 py-3 text-sm text-white outline-none transition',
              errorMessage
                ? 'border-rose-400/60 focus:border-rose-300'
                : 'border-white/15 focus:border-primary',
            ].join(' ')}
          />
          {errorMessage && (
            <p className="mt-2 text-sm text-rose-300">{errorMessage}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Agora nao
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Salvando...
              </span>
            ) : (
              'Salvar e continuar'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
