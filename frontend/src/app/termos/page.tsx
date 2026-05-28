import Link from 'next/link';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';

export const metadata = {
  title: 'Termos de Uso - EasyBarber',
  description: 'Termos e condições de uso da plataforma EasyBarber.',
};

const LAST_UPDATE = '28 de maio de 2026';

const sections = [
  {
    title: '1. Aceitação dos termos',
    paragraphs: [
      'Ao criar uma conta, acessar ou utilizar a plataforma EasyBarber ("plataforma", "serviço"), você concorda integralmente com estes Termos de Uso. Caso não concorde com qualquer condição, não utilize o serviço.',
      'Estes termos se aplicam a todos os usuários, incluindo proprietários de barbearias, equipe e clientes finais que interajam com os recursos da plataforma.',
    ],
  },
  {
    title: '2. Descrição do serviço',
    paragraphs: [
      'O EasyBarber é uma plataforma de gestão para barbearias que oferece agendamento online, cadastro de clientes, controle financeiro, gestão de equipe, notificações automáticas e recursos relacionados.',
      'O serviço é fornecido no modelo de assinatura (SaaS) e pode ser ajustado, ampliado ou descontinuado a qualquer momento, mediante comunicação prévia quando aplicável.',
    ],
  },
  {
    title: '3. Cadastro e conta',
    paragraphs: [
      'Para utilizar o serviço, é necessário fornecer informações verdadeiras, completas e atualizadas. Você é responsável por manter a confidencialidade das credenciais de acesso e por todas as atividades realizadas em sua conta.',
      'Notifique-nos imediatamente em caso de uso não autorizado ou suspeita de violação de segurança da sua conta.',
    ],
  },
  {
    title: '4. Planos, pagamento e período de teste',
    paragraphs: [
      'Os planos, preços e condições estão descritos na página de planos. Na primeira assinatura, determinados planos podem incluir período de teste gratuito, conforme indicado no momento da contratação.',
      'Os pagamentos são processados por provedores terceiros (cartão via Stripe e Pix via Asaas). A não confirmação ou o cancelamento do pagamento pode resultar na suspensão do acesso aos recursos.',
    ],
  },
  {
    title: '5. Responsabilidades do usuário',
    paragraphs: [
      'Você se compromete a utilizar a plataforma de forma lícita, sem violar direitos de terceiros, e a não inserir conteúdo ilegal, ofensivo ou que infrinja a legislação vigente.',
      'O usuário é o único responsável pelos dados que cadastra, incluindo informações de clientes, e por obter as autorizações necessárias para o tratamento desses dados.',
    ],
  },
  {
    title: '6. Disponibilidade e suporte',
    paragraphs: [
      'Empenhamo-nos para manter a plataforma disponível de forma contínua, mas não garantimos operação ininterrupta ou livre de erros. Manutenções programadas e eventuais indisponibilidades podem ocorrer.',
      'O suporte é prestado pelos canais oficiais informados na plataforma, em horário comercial.',
    ],
  },
  {
    title: '7. Propriedade intelectual',
    paragraphs: [
      'Todo o conteúdo, marca, software e elementos da plataforma pertencem ao EasyBarber e à EasyConnect, sendo protegidos pela legislação aplicável. É vedada a reprodução, distribuição ou modificação sem autorização expressa.',
    ],
  },
  {
    title: '8. Limitação de responsabilidade',
    paragraphs: [
      'Na máxima extensão permitida pela lei, o EasyBarber não se responsabiliza por danos indiretos, lucros cessantes ou perdas decorrentes do uso ou da impossibilidade de uso da plataforma.',
    ],
  },
  {
    title: '9. Rescisão',
    paragraphs: [
      'Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar o acesso em caso de violação destes termos, fraude ou inadimplência, observada a legislação aplicável.',
    ],
  },
  {
    title: '10. Alterações dos termos',
    paragraphs: [
      'Estes termos podem ser atualizados periodicamente. A versão vigente estará sempre disponível nesta página, com a data da última atualização. O uso continuado após alterações representa concordância com a nova versão.',
    ],
  },
  {
    title: '11. Contato',
    paragraphs: [
      'Dúvidas sobre estes Termos de Uso podem ser encaminhadas para contato@easyconnectcg.com.br.',
    ],
  },
];

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <PublicNavbar />

      <main id="main-content" className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Documentos legais</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Termos de Uso</h1>
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
          Consulte também a nossa{' '}
          <Link href="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
