import '../styles/globals.css'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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
      <body>
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
