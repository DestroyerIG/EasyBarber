import { AppError } from '../../utils/errors.js';
import { asaasBillingProvider } from './providers/asaasBillingProvider.js';
import { stripeBillingProvider } from './providers/stripeBillingProvider.js';

const PROVIDERS = Object.freeze({
  stripe: stripeBillingProvider,
  asaas: asaasBillingProvider,
});

const PAYMENT_METHOD_PROVIDER_MAP = Object.freeze({
  card: 'stripe',
  pix: 'asaas',
  boleto: 'stripe',
});

export const billingProviderFactory = {
  getProvider(providerName) {
    const provider = PROVIDERS[providerName];

    if (!provider) {
      throw new AppError('Provider de billing não suportado', 400, 'INVALID_BILLING_PROVIDER');
    }

    return provider;
  },

  resolveProviderByPaymentMethod(paymentMethod) {
    const normalized = typeof paymentMethod === 'string' ? paymentMethod.trim().toLowerCase() : '';
    const providerName = PAYMENT_METHOD_PROVIDER_MAP[normalized];

    if (!providerName) {
      throw new AppError('Método de pagamento inválido', 400, 'INVALID_PAYMENT_METHOD');
    }

    return providerName;
  },

  listProviders() {
    return Object.keys(PROVIDERS);
  },
};
