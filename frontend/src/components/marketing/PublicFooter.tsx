import Image from 'next/image';
import Link from 'next/link';
import easyBarberLogo from '@/icons/easybarber.png';

const EASYCONNECT_URL = 'https://easyconnectcg.com.br';

const defaultContactUrl =
  'https://wa.me/5583991347023?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyBarber';

export function PublicFooter() {
  const contactUrl = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_URL || defaultContactUrl;

  return (
    <footer className="border-t border-white/10 bg-black/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-black/40">
              <Image src={easyBarberLogo} alt="Logo EasyBarber" width={40} height={40} className="h-full w-full object-contain" priority />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
          </div>
          <h3 className="mt-3 text-2xl font-black">Sistema para barbearias com foco em performance comercial.</h3>
          <p className="mt-3 max-w-lg text-sm text-gray-400">
            Centralize agendamentos, clientes, financeiro e equipe em uma plataforma confiável,
            moderna e pronta para escalar seu negócio.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-gray-200">Links úteis</h4>
          <ul className="mt-4 space-y-2 text-sm text-gray-400">
            <li><a href="#inicio" className="hover:text-white">Início</a></li>
            <li><a href="#recursos" className="hover:text-white">Recursos</a></li>
            <li><a href="#planos" className="hover:text-white">Planos</a></li>
            <li><a href="#contato" className="hover:text-white">Contato</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-gray-200">Contato</h4>
          <ul className="mt-4 space-y-2 text-sm text-gray-400">
            <li>
              <a href={contactUrl} target="_blank" rel="noreferrer" className="hover:text-white">
                WhatsApp Comercial
              </a>
            </li>
            <li>
              <a href="mailto:contato@easybarber.com" className="hover:text-white">
                contato@easyconnectcg.com.br
              </a>
            </li>
            <li>Seg a Sex, 9h às 18h</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-gray-500 lg:flex-row lg:px-8">
          <p>© {new Date().getFullYear()} EasyBarber. Todos os direitos reservados.</p>
          <a
            href={EASYCONNECT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Powered by EasyConnect"
          >
            <span className="text-xs text-gray-500">Powered by</span>
            <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5">
              <Image
                src="/easyconnect-logo.svg"
                alt="EasyConnect"
                width={90}
                height={26}
                className="h-[26px] w-auto object-contain"
                unoptimized
              />
            </span>
          </a>
          <div className="flex items-center gap-4">
            <Link href="/termos" className="hover:text-gray-300">Termos</Link>
            <Link href="/privacidade" className="hover:text-gray-300">Privacidade</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
