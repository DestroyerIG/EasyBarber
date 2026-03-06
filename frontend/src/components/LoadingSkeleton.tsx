'use client';

export function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-black" role="status" aria-label="Carregando conteúdo" aria-busy="true">
            <span className="sr-only">Carregando...</span>
            {/* Navbar skeleton */}
            <nav className="bg-dark-light border-b border-primary/20 p-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="h-8 w-40 skeleton" />
                    <div className="hidden lg:flex gap-4">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="h-10 w-28 skeleton" />
                        ))}
                    </div>
                    <div className="h-8 w-8 skeleton" />
                </div>
            </nav>

            {/* Content skeleton */}
            <main className="max-w-7xl mx-auto p-4 lg:p-8">
                <div className="h-10 w-48 skeleton mb-8" />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="card rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-8 w-8 skeleton rounded" />
                                <div className="h-10 w-20 skeleton" />
                            </div>
                            <div className="h-5 w-36 skeleton" />
                        </div>
                    ))}
                </div>

                <div className="card rounded-xl p-8 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="h-8 w-40 skeleton" />
                        <div className="h-10 w-32 skeleton" />
                    </div>
                    <div className="h-1 skeleton rounded-full" />
                </div>

                <div className="card rounded-xl p-8">
                    <div className="h-8 w-52 skeleton mb-6" />
                    <div className="h-[300px] skeleton" />
                </div>
            </main>
        </div>
    );
}
