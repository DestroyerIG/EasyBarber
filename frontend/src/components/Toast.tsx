'use client';

import { useState, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({
    showToast: () => { }
});

export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const icons = {
        success: <CheckCircle className="text-green-400" size={20} />,
        error: <AlertCircle className="text-red-400" size={20} />,
        info: <Info className="text-blue-400" size={20} />
    };

    const borderColors = {
        success: 'border-green-500/30',
        error: 'border-red-500/30',
        info: 'border-blue-500/30'
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`bg-dark-light border ${borderColors[toast.type]} rounded-xl p-4 pr-10 shadow-2xl min-w-[300px] max-w-[420px] animate-slide-in`}
                    >
                        <div className="flex items-start gap-3">
                            {icons[toast.type]}
                            <p className="text-white text-sm leading-relaxed">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
