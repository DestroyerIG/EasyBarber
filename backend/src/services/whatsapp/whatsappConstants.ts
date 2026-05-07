/**
 * Constantes do bot WhatsApp — steps do fluxo conversacional, timeouts, defaults.
 */

export const SESSION_TIMEOUT_MS = parseInt(process.env.WHATSAPP_SESSION_TIMEOUT_MS || '1800000', 10); // 30 min

/**
 * Steps (estados) da máquina de estados do fluxo conversacional.
 */
export const STEPS = {
  MENU: 'menu',
  CHOOSE_SERVICE: 'choose_service',
  ASK_NAME: 'ask_name',
  CHOOSE_BARBER: 'choose_barber',
  CHOOSE_DATE: 'choose_date',
  CHOOSE_TIME: 'choose_time',
  CONFIRM_CANCEL: 'confirm_cancel',
  CONFIRM_RESCHEDULE: 'confirm_reschedule',
  SEND_RATING: 'send_rating',
  VIEW_SERVICES: 'view_services',
} as const;

export type StepKey = keyof typeof STEPS;
export type StepValue = (typeof STEPS)[StepKey];

/**
 * Opções padrão do menu do bot.
 */
export interface MenuOption {
  order: number;
  label: string;
  emoji: string;
  handler: string;
}

export const DEFAULT_MENU_OPTIONS: MenuOption[] = [
  { order: 1, label: 'Agendar um horário', emoji: '💈', handler: 'schedule' },
  { order: 2, label: 'Ver nossos serviços', emoji: '📋', handler: 'view_services' },
  { order: 3, label: 'Cancelar agendamento', emoji: '❌', handler: 'cancel' },
  { order: 4, label: 'Reagendamento', emoji: '🔄', handler: 'reschedule' },
  { order: 5, label: 'Avaliação pós-atendimento', emoji: '⭐', handler: 'rating' },
  { order: 6, label: 'Promoções', emoji: '🎉', handler: 'promotions' },
  { order: 7, label: 'Instagram', emoji: '📱', handler: 'instagram' },
  { order: 8, label: 'Falar com um humano', emoji: '👨‍💼', handler: 'attendant' },
  { order: 9, label: 'Encerrar atendimento', emoji: '🚪', handler: 'end_session' },
];

/**
 * Shape of bot config messages.
 */
export interface BotConfig {
  welcome_header: string;
  ask_name_message: string;
  attendant_message: string;
  confirmation_message: string;
  reminder_message: string;
  invalid_option_message: string;
  session_expired_message: string;
  end_session_message: string;
  name_validation_message: string;
  no_slots_message: string;
  cancel_no_appointments_message: string;
  cancel_list_message: string;
  cancel_success_message: string;
  reschedule_no_appointments_message: string;
  reschedule_list_message: string;
  no_previous_appointments_message: string;
  rating_question_message: string;
  rating_confirmation_message: string;
  promotions_message: string;
  instagram_message: string;
}

/**
 * Mensagens padrão do bot (usadas quando não há configuração no banco).
 */
export const DEFAULT_BOT_CONFIG: BotConfig = {
  welcome_header: 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nMe chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.\n\nComo posso ajudar hoje?',
  ask_name_message: 'Vejo que é sua primeira vez aqui! 😊\n\nQual o seu *nome completo*?',
  attendant_message: 'Um atendente entrará em contato em breve! 👨‍💼',
  confirmation_message: '✅ Seu horário foi agendado com sucesso! 💈\n\n📋 Serviço: {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n📅 Data: {data}\n⏰ Horário: {horario}\n💰 Valor: R$ {valor}\n\nAté lá! 👋',
  reminder_message: '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n⏰ {horario}\n\nTe esperamos! 💈',
  invalid_option_message: 'Opção inválida. Por favor, escolha um número da lista.',
  session_expired_message: '⏰ Sua sessão expirou por inatividade.\n\nDigite qualquer coisa para começar novamente.',
  end_session_message: '✅ Atendimento encerrado.\n\nSe precisar novamente, é só mandar uma nova mensagem.',
  name_validation_message: 'Por favor, digite seu nome completo para continuarmos.\n\n0️⃣ Ou digite 0 para voltar ao menu de atendimento',
  no_slots_message: 'Infelizmente não há horários disponíveis com este barbeiro nesta data. Escolha outra data ou barbeiro.\n\n0️⃣ Voltar ao menu de atendimento',
  cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe deseja agendar, escolha a opção 1️⃣',
  cancel_list_message: '❌ Seus agendamentos próximos:',
  cancel_success_message: '✅ Seu agendamento foi cancelado com sucesso!\n\nSe deseja remarcar ou agende um novo horário.',
  reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe deseja agendar, escolha a opção 1️⃣',
  reschedule_list_message: '🔄 Seus agendamentos disponíveis para reagendamento:',
  no_previous_appointments_message: '📊 Você não tem atendimentos anteriores para avaliar.\n\nVolte após seu próximo corte! 💇',
  rating_question_message: '⭐ *Como foi seu atendimento?*\n\n1️⃣ Excelente! 😍\n2️⃣ Bom 😊\n3️⃣ Pode melhorar 😐\n4️⃣ Ruim 😞\n\n0️⃣ Voltar ao menu de atendimento\n\nSua opinião nos ajuda a melhorar cada vez mais!',
  rating_confirmation_message: '✅ Obrigado pela sua avaliação: {avaliacao}\n\nSua opinião é muito importante para melhorarmos cada vez mais!\n\n👉 O que mais podemos fazer por você?',
  promotions_message: '🎉 *Promoções e Ofertas Especiais!*\n\n💈 *Desconto de 10%* em todos os serviços para clientes frequentes!\n\n💝 *Promoção do Mês:* Corte + Barba por apenas R$ 49,90\n(Válido até o final do mês)\n\n🎁 *Indique um amigo* e ganhe 5% em seu próximo atendimento!\n\nPara aproveitar as promoções, agende agora!',
  instagram_message: '📱 *Nos acompanhe no Instagram!*\n\n🎨 Veja nossos trabalhos, dicas de estilo e tendências!\n\n👉 {instagram_handle}\n\n📸 Siga-nos para:\n✨ Vê os melhores cortes\n💡 Receber dicas de beleza\n🎯 Acompanhar promoções exclusivas\n\n📲 Clique no link para nos seguir!',
};

/**
 * Mensagens de fallback para erros de configuração.
 */
export const FALLBACK_BOT_CONFIG: BotConfig = {
  welcome_header: 'Olá 👋 Bem-vindo!',
  ask_name_message: 'Qual o seu nome?',
  attendant_message: 'Aguarde um momento.',
  confirmation_message: 'Agendado!',
  reminder_message: 'Lembrete: seu horário é em breve!',
  invalid_option_message: 'Opção inválida.',
  session_expired_message: 'Sessão expirada.',
  end_session_message: 'Atendimento encerrado.',
  name_validation_message: 'Digite seu nome completo.',
  no_slots_message: 'Sem horários disponíveis.',
  cancel_no_appointments_message: 'Sem agendamentos para cancelar.',
  cancel_list_message: 'Seus agendamentos:',
  cancel_success_message: 'Cancelado com sucesso!',
  reschedule_no_appointments_message: 'Sem agendamentos para reagendar.',
  reschedule_list_message: 'Seus agendamentos:',
  no_previous_appointments_message: 'Sem atendimentos anteriores.',
  rating_question_message: 'Como foi seu atendimento? (1-4)',
  rating_confirmation_message: 'Obrigado pela avaliação!',
  promotions_message: 'Confira nossas promoções!',
  instagram_message: 'Siga-nos no Instagram!',
};

export const RATING_TEXTS: Record<number, string> = {
  1: 'Excelente! 😍',
  2: 'Bom 😊',
  3: 'Pode melhorar 😐',
  4: 'Ruim 😞',
};
