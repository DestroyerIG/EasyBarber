'use client';

import { useState, useEffect, useRef } from 'react';
import { Modal, ModalFooter } from '@/components/ui';
import { Scissors, Camera, Save, X, Loader2 } from 'lucide-react';
import type { Service, Barber } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

export interface ServiceFormData {
  name: string;
  price: string;
  duration_minutes: string;
}

export interface BarberFormData {
  name: string;
  photo: string;
}

interface ServiceBarberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitService: (data: ServiceFormData) => Promise<void>;
  onSubmitBarber: (data: BarberFormData) => Promise<void>;
  activeTab: 'servicos' | 'barbeiros';
  editingItem: Service | Barber | null;
}

const BUCKET = 'barber-photos';

export const ServiceBarberModal = ({
  isOpen,
  onClose,
  onSubmitService,
  onSubmitBarber,
  activeTab,
  editingItem,
}: ServiceBarberModalProps) => {
  const [serviceForm, setServiceForm] = useState<ServiceFormData>({ name: '', price: '', duration_minutes: '' });
  const [barberForm, setBarberForm] = useState<BarberFormData>({ name: '', photo: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setPhotoFile(null);
    setPhotoPreview('');
    if (activeTab === 'servicos') {
      if (editingItem && 'price' in editingItem) {
        setServiceForm({
          name: editingItem.name,
          price: editingItem.price.toString(),
          duration_minutes: editingItem.duration_minutes.toString(),
        });
      } else {
        setServiceForm({ name: '', price: '', duration_minutes: '' });
      }
    } else {
      if (editingItem && 'photo' in editingItem) {
        const existingPhoto = (editingItem as Barber).photo || '';
        setBarberForm({ name: editingItem.name, photo: existingPhoto });
        setPhotoPreview(existingPhoto);
      } else {
        setBarberForm({ name: '', photo: '' });
      }
    }
  }, [isOpen, editingItem, activeTab]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Foto deve ter no máximo 5 MB.', 'error');
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    setBarberForm(prev => ({ ...prev, photo: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const supabase = getSupabaseClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (activeTab === 'servicos') {
        await onSubmitService(serviceForm);
      } else {
        let photoUrl = barberForm.photo;

        if (photoFile) {
          try {
            photoUrl = await uploadPhoto(photoFile);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido';
            showToast(`Falha no upload da foto: ${msg}`, 'error');
            return;
          }
        }

        await onSubmitBarber({ ...barberForm, photo: photoUrl });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const title = activeTab === 'servicos'
    ? (editingItem ? 'Editar Serviço' : 'Novo Serviço')
    : (editingItem ? 'Editar Barbeiro' : 'Novo Barbeiro');

  const isLoading = submitting || uploading;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={activeTab === 'servicos' ? Scissors : undefined}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={() => {
            const form = document.getElementById('service-barber-form') as HTMLFormElement;
            form?.requestSubmit();
          }}
          submitLabel={uploading ? 'Enviando foto...' : 'Salvar'}
          submitIcon={uploading ? Loader2 : Save}
          submitting={isLoading}
        />
      }
    >
      <form id="service-barber-form" onSubmit={handleSubmit} className="space-y-6">
        {activeTab === 'servicos' ? (
          <>
            <div className="space-y-2">
              <label className="field-label">Nome do Serviço</label>
              <input
                required
                type="text"
                value={serviceForm.name}
                onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                className="input"
                placeholder="Ex: Corte Degradê"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="field-label">Preço (R$)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })}
                  className="input"
                  placeholder="50.00"
                />
              </div>
              <div className="space-y-2">
                <label className="field-label">Duração (Min)</label>
                <input
                  required
                  type="number"
                  value={serviceForm.duration_minutes}
                  onChange={e => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                  className="input"
                  placeholder="30"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="field-label">Nome do Barbeiro</label>
              <input
                required
                type="text"
                value={barberForm.name}
                onChange={e => setBarberForm({ ...barberForm, name: e.target.value })}
                className="input"
                placeholder="Ex: Gabriel Souza"
              />
            </div>

            <div className="space-y-2">
              <label className="field-label">Foto (Opcional)</label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />

              {photoPreview ? (
                <div className="relative flex items-center gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Prévia da foto"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/30 hover:text-white"
                    >
                      <Camera size={14} /> Trocar foto
                    </button>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="flex items-center gap-2 rounded-lg border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 transition hover:border-red-500/40 hover:text-red-300"
                    >
                      <X size={14} /> Remover foto
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-8 text-gray-500 transition hover:border-primary/40 hover:text-primary/70"
                >
                  <Camera size={28} />
                  <span className="text-sm">Clique para selecionar uma foto</span>
                  <span className="text-xs text-gray-600">JPG, PNG ou WEBP · máx. 5 MB</span>
                </button>
              )}
            </div>
          </>
        )}
      </form>
    </Modal>
  );
};
