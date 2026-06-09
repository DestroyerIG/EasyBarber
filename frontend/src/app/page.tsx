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
  'https://wa.me/5583991347023?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyBarber';

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
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-220px] top-[-120px] h-[420px] w-[420px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-140px] right-[-180px] h-[360px] w-[360px] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <PublicNavbar />

      <main id="main-content">
        {/* Hero */}
        <section
          id="inicio"
          className="mx-auto grid max-w-7xl gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-8 lg:pt-16"
        >
          <div className="animate-fade-in">
            <p className="section-eyebrow">Sistema de gestão para barbearias</p>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:mt-5 sm:text-4xl lg:text-5xl xl:text-6xl">
              Gerencie sua barbearia com mais controle, automação e crescimento previsível.
            </h1>
            <p className="mt-4 max-w-xl text-base text-gray-300 sm:mt-6 sm:text-lg">
              O EasyBarber organiza agendamentos, clientes, financeiro e equipe em uma plataforma única,
              profissional e pronta para escalar seu negócio.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link
                href="/cadastro"
                className="btn-primary inline-flex items-center justify-center px-6 py-3 text-center text-base"
              >
                Começar grátis · 14 dias
              </Link>
              <a
                href={contactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-center text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-400"
              >
                Entrar em contato
              </a>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-400 sm:mt-5 sm:gap-3">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                14 dias grátis
              </span>
              <span className="rounded-full border border-white/15 px-3 py-1">Sem cartão no cadastro</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Setup rápido</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Sem fidelidade rígida</span>
            </div>
          </div>

          <div className="animate-slide-up rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 shadow-2xl shadow-black/60 sm:p-6">
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
                <p className="mt-2 text-base text-gray-200 sm:text-lg">
                  Gestão de equipe, caixa, clientes e performance em um só painel.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefícios */}
        <section
          aria-label="Benefícios principais"
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16"
        >
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {benefits.map((benefit) => (
              <article
                key={benefit.title}
                className="flex h-full flex-col rounded-2xl border border-white/10 bg-dark-light p-5 sm:p-6"
              >
                <h2 className="text-lg font-black sm:text-xl">{benefit.title}</h2>
                <p className="mt-3 text-sm text-gray-400 sm:text-base">{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Recursos */}
        <section
          id="recursos"
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16"
        >
          <div className="mb-6 max-w-3xl lg:mb-10">
            <p className="section-eyebrow">Recursos</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl lg:text-4xl">
              Funcionalidades criadas para uma gestão de verdade
            </h2>
            <p className="mt-3 text-sm text-gray-400 sm:mt-4 sm:text-base">
              Da agenda ao faturamento recorrente, o EasyBarber foi pensado para reduzir ruído operacional e aumentar conversão.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="flex h-full flex-col rounded-2xl border border-white/10 bg-dark-light p-5 transition-all hover:-translate-y-1 hover:border-primary/40"
              >
                <feature.icon className="h-7 w-7 text-primary sm:h-8 sm:w-8" aria-hidden="true" />
                <h3 className="mt-3 text-base font-bold sm:mt-4 sm:text-lg">{feature.title}</h3>
                <p className="mt-2 text-xs text-gray-400 sm:text-sm">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Preços */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          <PricingPlansSection />
        </section>

        {/* CTA */}
        <section
          id="contato"
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16"
        >
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6 sm:p-8 lg:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 sm:tracking-[0.24em]">
              Contato comercial
            </p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl lg:text-4xl">
              Quer acelerar sua barbearia com estrutura profissional?
            </h2>
            <p className="mt-3 max-w-3xl text-sm text-gray-200 sm:mt-4 sm:text-base">
              Nossa equipe te ajuda a definir o melhor plano, organizar o onboarding e ativar o EasyBarber com foco em resultado.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row">
              <a
                href={contactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-center text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-400"
              >
                Entrar em contato
              </a>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 text-center text-base font-semibold text-white hover:border-white"
              >
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
