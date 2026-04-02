import Link from 'next/link';
import {
  CalendarClock,
  BarChart3,
  Coins,
  MessageCircleMore,
  Scissors,
  UsersRound,
  BellRing,
  Building2,
} from 'lucide-react';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';

const defaultContactUrl =
  'https://wa.me/5500000000000?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyBarber';

const benefits = [
  {
    title: 'Agendamentos online sem ruído',
    description: 'Sua agenda roda 24h com menos conflito de horários e mais ocupação dos barbeiros.',
  },
  {
    title: 'Operação centralizada',
    description: 'Clientes, serviços, equipe e financeiro em um único painel de decisão.',
  },
  {
    title: 'Previsibilidade de receita',
    description: 'Relatórios e indicadores claros para crescer com segurança e margem saudável.',
  },
];

const features = [
  {
    icon: CalendarClock,
    title: 'Agenda inteligente',
    description: 'Controle de horários, encaixes e confirmações automáticas para reduzir no-show.',
  },
  {
    icon: UsersRound,
    title: 'Gestão de clientes',
    description: 'Histórico completo de atendimentos, preferências e recorrência por cliente.',
  },
  {
    icon: Scissors,
    title: 'Comissões e equipe',
    description: 'Acompanhe produtividade e resultados por barbeiro com transparência.',
  },
  {
    icon: Coins,
    title: 'Caixa e financeiro',
    description: 'Acompanhe entradas, saídas e lucro líquido diário, mensal e por período.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios gerenciais',
    description: 'Indicadores práticos para decidir rápido e escalar sem perder qualidade.',
  },
  {
    icon: BellRing,
    title: 'Notificações automáticas',
    description: 'Lembretes e mensagens para manter agenda cheia e cliente bem atendido.',
  },
  {
    icon: MessageCircleMore,
    title: 'Assinatura recorrente',
    description: 'Billing integrado para manter o crescimento com previsibilidade comercial.',
  },
  {
    icon: Building2,
    title: 'Pronto para expansão',
    description: 'Base preparada para multiunidade e gestão mais estratégica no futuro.',
  },
];

export default function HomePage() {
  const contactUrl = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_URL || defaultContactUrl;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-220px] top-[-120px] h-[420px] w-[420px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-140px] right-[-180px] h-[360px] w-[360px] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <PublicNavbar />

      <main id="main-content">
        <section id="inicio" className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-16 lg:grid-cols-2 lg:items-center lg:px-8">
          <div className="animate-fade-in">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">SaaS de gestão para barbearias</p>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Gerencie sua barbearia com mais controle, automação e crescimento previsível.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-gray-300">
              O EasyBarber organiza agendamentos, clientes, financeiro e equipe em uma plataforma única,
              profissional e pronta para escalar seu negócio.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/cadastro" className="btn-primary text-center text-base">
                Começar agora
              </Link>
              <a
                href={contactUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-emerald-500 px-6 py-3 text-center text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-400"
              >
                Entrar em contato
              </a>
            </div>

            <div className="mt-5 flex flex-wrap gap-4 text-sm text-gray-400">
              <span className="rounded-full border border-white/15 px-3 py-1">Setup rápido</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Sem fidelidade rígida</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Fluxo comercial completo</span>
            </div>
          </div>

          <div className="animate-slide-up rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 shadow-2xl shadow-black/60">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400">Agendamentos</p>
                <p className="mt-2 text-2xl font-black">+37%</p>
                <p className="mt-1 text-xs text-gray-400">Aumento de ocupação mensal</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400">No-show</p>
                <p className="mt-2 text-2xl font-black text-emerald-400">-24%</p>
                <p className="mt-1 text-xs text-gray-400">Com lembretes automáticos</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/50 p-4 sm:col-span-2">
                <p className="text-xs uppercase tracking-wider text-gray-400">Visão operacional em tempo real</p>
                <p className="mt-2 text-lg text-gray-200">
                  Gestão de equipe, caixa, clientes e performance em um só painel.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-2xl border border-white/10 bg-dark-light p-6">
                <h2 className="text-xl font-black">{benefit.title}</h2>
                <p className="mt-3 text-gray-400">{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="recursos" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Recursos</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Funcionalidades criadas para uma operação SaaS de verdade</h2>
            <p className="mt-4 text-gray-400">
              Da agenda ao faturamento recorrente, o EasyBarber foi pensado para reduzir ruído operacional e aumentar conversão.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-white/10 bg-dark-light p-5 transition-all hover:-translate-y-1 hover:border-primary/40">
                <feature.icon className="h-8 w-8 text-primary" />
                <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <PricingPlansSection />
        </section>

        <section id="contato" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-8 lg:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Contato comercial</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              Quer acelerar sua barbearia com estrutura profissional?
            </h2>
            <p className="mt-4 max-w-3xl text-gray-200">
              Nossa equipe te ajuda a definir o melhor plano, organizar o onboarding e ativar o EasyBarber com foco em resultado.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={contactUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-emerald-500 px-6 py-3 text-center text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-400"
              >
                Entrar em contato
              </a>
              <Link href="/login" className="rounded-xl border border-white/25 px-6 py-3 text-center text-base font-semibold text-white hover:border-white">
                Fazer login
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
