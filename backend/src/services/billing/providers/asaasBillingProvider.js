import { AppError } from '../../../utils/errors.js';
import { asaasService } from '../../../integrations/asaas/service.js';
import { asaasMapper } from '../../../integrations/asaas/mapper.js';
import { mapAsaasStatusToInternalStatus } from '../statusMapper.js';

export const asaasBillingProvider = {
  provider: 'asaas',

  async createCustomer({
    barbershop,
    idempotencyKey = null,
    onCustomerResolved = null,
  }) {
    return asaasService.getOrCreateAsaasCustomer({
      barbershop,
      idempotencyKey,
      onCustomerResolved,
    });
  },

  async createSubscription({
    barbershop,
    plan,
    idempotencyKey = null,
    onCustomerResolved = null,
  }) {
    if (!barbershop) {
      throw new AppError('Barbearia inválida para checkout Pix', 400, 'INVALID_BARBERSHOP');
    }

    return asaasService.createPixSubscription({
      barbershop,
      plan,
      idempotencyKey,
      onCustomerResolved,
    });
  },

  async createPixCharge({
    customerId,
    barbershopId,
    plan,
    amount,
    dueDate,
    description,
    externalReference,
    idempotencyKey = null,
  }) {
    return asaasService.createPixCharge({
      customerId,
      barbershopId,
      plan,
      amount,
      dueDate,
      description,
      externalReference,
      idempotencyKey,
    });
  },

  async getPaymentStatus(paymentId) {
    return asaasService.getPaymentWithPixData(paymentId);
  },

  async cancelSubscription({ subscriptionId }) {
    return asaasService.cancelSubscription(subscriptionId);
  },

  async reactivateSubscription({ subscriptionId }) {
    return asaasService.reactivateSubscription(subscriptionId);
  },

  async handleWebhook(payload) {
    return asaasMapper.normalizeAsaasWebhookPayload(payload);
  },

  mapExternalStatusToInternalStatus(externalStatus) {
    return mapAsaasStatusToInternalStatus(externalStatus);
  },
};
