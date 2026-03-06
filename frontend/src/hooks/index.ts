'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

/**
 * Hook para fetch de dados com loading/error state e cleanup via AbortController.
 */
export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(url, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(response.data);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    reload();
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading, error, reload, setData };
}

/**
 * Hook de debounce para busca.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook para formulários com submit e loading.
 */
export function useFormSubmit<T>(initialData: T) {
  const [formData, setFormData] = useState<T>(initialData);
  const [submitting, setSubmitting] = useState(false);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const reset = useCallback(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleSubmit = useCallback(async (fn: (data: T) => Promise<void>) => {
    setSubmitting(true);
    try {
      await fn(formData);
    } finally {
      setSubmitting(false);
    }
  }, [formData]);

  return { formData, setFormData, updateField, submitting, reset, handleSubmit };
}

/**
 * Hook para modal open/close state.
 */
export function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  return { isOpen, open, close, toggle };
}

/**
 * Hook para click outside de um elemento (fechar modal/dropdown).
 */
export function useClickOutside<T extends HTMLElement>(handler: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);

  return ref;
}
