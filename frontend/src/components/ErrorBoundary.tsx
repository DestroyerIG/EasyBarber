'use client';

import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-black">
                    <div className="bg-dark-light border border-red-500/20 rounded-2xl p-8 max-w-md text-center" role="alert" aria-live="assertive">
                        <AlertCircle className="text-red-500 mx-auto mb-4" size={48} aria-hidden="true" />
                        <h2 className="text-2xl font-bold text-white mb-2">
                            Algo deu errado
                        </h2>
                        <p className="text-gray-400 mb-6">
                            Ocorreu um erro inesperado. Tente recarregar a página.
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-orange-600 text-black font-bold rounded-lg transition-all"
                        >
                            <RefreshCw size={18} />
                            Tentar Novamente
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
