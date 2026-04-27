-- Garante que novas barbearias não nasçam com acesso liberado sem pagamento.
ALTER TABLE barbershops
  ALTER COLUMN subscription_status SET DEFAULT 'incomplete';
