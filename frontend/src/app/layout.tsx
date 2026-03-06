import '../styles/globals.css'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider } from '@/contexts/AuthContext'

export const metadata = {
  title: 'BarberPro - Sistema para Barbearias',
  description: 'Sistema completo de agendamento e gestão para barbearias. Agende, controle finanças e gerencie seus clientes.',
  keywords: 'barbearia, agendamento, gestão, barbeiro, SaaS',
  openGraph: {
    title: 'BarberPro - Sistema para Barbearias',
    description: 'Sistema completo de agendamento e gestão para barbearias.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-dark text-white">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-primary focus:text-black focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold">
          Pular para o conteúdo
        </a>
        <ErrorBoundary>
          <ToastProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
