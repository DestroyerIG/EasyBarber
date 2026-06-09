import Link from 'next/link';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';

export const metadata = {
  title: 'Política de Privacidade - EasyBarber',
  description: 'Como o EasyBarber coleta, usa e protege os seus dados pessoais, em conformidade com a LGPD.',
};

const LAST_UPDATE = '28 de maio de 2026';

const sections = [
  {
    title: '1. Introdução',
    paragraphs: [
      'Esta Política de Privacidade descreve como o EasyBarber, operado pela EasyConnect, coleta, utiliza, armazena e protege os dados pessoais tratados na plataforma, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).',
      'Ao utilizar a plataforma, você declara estar ciente das práticas descritas neste documento.',
    ],
  },
  {
    title: '2. Dados que coletamos',
    paragraphs: [
      'Dados de cadastro: nome, e-mail, telefone/WhatsApp, CPF ou CNPJ e dados da barbearia necessários à prestação do serviço.',
      'Dados operacionais: agendamentos, histórico de atendimentos, informações de clientes cadastrados pelo titular da conta, dados financeiros e de equipe inseridos na plataforma.',
      'Dados de uso: informações técnicas como registros de acesso, endereço IP e identificadores de dispositivo, coletados para segurança e melhoria do serviço.',
    ],
  },
  {
    title: '3. Como utilizamos os dados',
    paragraphs: [
      'Utilizamos os dados para fornecer e operar a plataforma, processar pagamentos, enviar notificações e lembretes, prestar suporte, garantir segurança e cumprir obrigações legais e regulatórias.',
      'Não vendemos dados pessoais. O tratamento ocorre conforme as bases legais previstas na LGPD, como execução de contrato, cumprimento de obrigação legal e legítimo interesse.',
    ],
  },
  {
    title: '4. Compartilhamento com terceiros',
    paragraphs: [
      'Podemos compartilhar dados com provedores que viabilizam o serviço, como processadores de pagamento (Stripe e Asaas), serviços de hospedagem, banco de dados e envio de mensagens, sempre limitados à finalidade necessária.',
      'Esses provedores estão sujeitos a obrigações de confidencialidade e proteção de dados compatíveis com a legislação aplicável.',
    ],
  },
  {
    title: '5. Armazenamento e segurança',
    paragraphs: [
      'Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda ou alteração indevida. Os dados são mantidos pelo período necessário às finalidades descritas ou conforme exigido por lei.',
      'Apesar dos esforços, nenhum sistema é totalmente imune a riscos. Em caso de incidente de segurança relevante, adotaremos as providências previstas na LGPD.',
    ],
  },
  {
    title: '6. Responsabilidade pelos dados de clientes finais',
    paragraphs: [
      'A barbearia titular da conta é a controladora dos dados de seus próprios clientes inseridos na plataforma, sendo responsável por obter o consentimento e as bases legais necessárias. O EasyBarber atua como operador desses dados, tratando-os conforme as instruções do controlador.',
    ],
  },
  {
    title: '7. Direitos do titular',
    paragraphs: [
      'Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação e informações sobre o compartilhamento dos seus dados.',
      'Para exercer seus direitos, entre em contato pelo e-mail contato@easyconnectcg.com.br. Poderemos solicitar informações para confirmar sua identidade antes de atender à solicitação.',
    ],
  },
  {
    title: '8. Cookies e tecnologias semelhantes',
    paragraphs: [
      'Utilizamos cookies e tecnologias semelhantes para autenticação, manutenção de sessão e melhoria da experiência. Você pode gerenciar as preferências de cookies no seu navegador, ciente de que isso pode afetar funcionalidades da plataforma.',
    ],
  },
  {
    title: '9. Alterações desta política',
    paragraphs: [
      'Esta Política de Privacidade pode ser atualizada periodicamente. A versão vigente estará sempre disponível nesta página, com a data da última atualização.',
    ],
  },
  {
    title: '10. Contato',
    paragraphs: [
      'Para dúvidas, solicitações ou exercício de direitos relativos aos seus dados pessoais, entre em contato pelo e-mail contato@easyconnectcg.com.br.',
    ],
  },
];

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <PublicNavbar />

      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <p className="section-eyebrow">Documentos legais</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Política de Privacidade</h1>
        <p className="mt-3 text-sm text-gray-500">Última atualização: {LAST_UPDATE}</p>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <div className="mt-3 space-y-3 text-gray-300">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-sm text-gray-400">
          Consulte também os nossos{' '}
          <Link href="/termos" className="text-primary hover:underline">Termos de Uso</Link>.
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
