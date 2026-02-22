'use client';

export function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-black">
            {/* Navbar skeleton */}
            <nav className="bg-dark-light border-b border-primary/20 p-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="h-8 w-40 bg-gray-800 rounded-lg animate-pulse" />
                    <div className="hidden lg:flex gap-4">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="h-10 w-28 bg-gray-800 rounded-lg animate-pulse" />
                        ))}
                    </div>
                    <div className="h-8 w-8 bg-gray-800 rounded-lg animate-pulse" />
                </div>
            </nav>

            {/* Content skeleton */}
            <main className="max-w-7xl mx-auto p-4 lg:p-8">
                <div className="h-10 w-48 bg-gray-800 rounded-lg animate-pulse mb-8" />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-dark-light border border-gray-800 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-8 w-8 bg-gray-800 rounded animate-pulse" />
                                <div className="h-10 w-20 bg-gray-800 rounded animate-pulse" />
                            </div>
                            <div className="h-5 w-36 bg-gray-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>

                <div className="bg-dark-light border border-gray-800 rounded-xl p-8 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="h-8 w-40 bg-gray-800 rounded-lg animate-pulse" />
                        <div className="h-10 w-32 bg-gray-800 rounded-lg animate-pulse" />
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full animate-pulse" />
                </div>

                <div className="bg-dark-light border border-gray-800 rounded-xl p-8">
                    <div className="h-8 w-52 bg-gray-800 rounded-lg animate-pulse mb-6" />
                    <div className="h-[300px] bg-gray-800 rounded-lg animate-pulse" />
                </div>
            </main>
        </div>
    );
}
