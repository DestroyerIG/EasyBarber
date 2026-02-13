import '../styles/globals.css'

export const metadata = {
  title: 'BarberPro - Sistema para Barbearias',
  description: 'Sistema completo de agendamento e gestão para barbearias',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
