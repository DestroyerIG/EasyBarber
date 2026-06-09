import '../styles/globals.css'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider } from '@/contexts/AuthContext'
import localFont from 'next/font/local'
import easyBarberLogo from '@/icons/easybarber.png'

const plusJakartaSans = localFont({
  src: '../assets/fonts/plus-jakarta-sans-latin.woff2',
  variable: '--font-sans',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: '../assets/fonts/space-grotesk-latin.woff2',
  variable: '--font-display',
  weight: '300 700',
  style: 'normal',
  display: 'swap',
});

export const metadata = {
  title: 'EasyBarber - Gestão para Barbearias',
  description: 'EasyBarber é a plataforma para agendamentos, clientes, financeiro e crescimento previsível da sua barbearia.',
  keywords: 'easybarber, barbearia, agendamento online, gestão financeira, sistema para barbearias',
  openGraph: {
    title: 'EasyBarber - Gestão para Barbearias',
    description: 'Controle total da operação da sua barbearia com agendamentos, equipe, clientes e financeiro em um só lugar.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EasyBarber - Gestão para Barbearias',
    description: 'Controle total da operação da sua barbearia com agendamentos, equipe, clientes e financeiro em um só lugar.',
  },
  icons: {
    icon: easyBarberLogo.src,
    shortcut: easyBarberLogo.src,
    apple: easyBarberLogo.src,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head />
      <body className={`${plusJakartaSans.variable} ${spaceGrotesk.variable} bg-dark text-white`}>
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
