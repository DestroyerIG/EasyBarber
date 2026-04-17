-- Migration v13: adiciona CPF/CNPJ da barbearia para billing Pix (Asaas)
-- Run after migration_v12.sql

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20);
