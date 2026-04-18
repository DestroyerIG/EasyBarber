-- Migration v14: normaliza CPF/CNPJ do pagador para checkout Pix
-- Run after migration_v13.sql

BEGIN;

-- Garante coluna de documento no cadastro pendente (fluxo Supabase)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pending_registrations'
  ) THEN
    ALTER TABLE pending_registrations
      ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20);
  END IF;
END
$$;

-- Remove mascara e caracteres nao numericos da barbearia
UPDATE barbershops
SET cpf_cnpj = NULLIF(regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]+', '', 'g'), '')
WHERE cpf_cnpj IS NOT NULL;

-- Mantem apenas CPF (11) ou CNPJ (14); dados legados invalidos viram NULL
UPDATE barbershops
SET cpf_cnpj = NULL
WHERE cpf_cnpj IS NOT NULL
  AND cpf_cnpj !~ '^([0-9]{11}|[0-9]{14})$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pending_registrations'
  ) THEN
    UPDATE pending_registrations
    SET cpf_cnpj = NULLIF(regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]+', '', 'g'), '')
    WHERE cpf_cnpj IS NOT NULL;

    UPDATE pending_registrations
    SET cpf_cnpj = NULL
    WHERE cpf_cnpj IS NOT NULL
      AND cpf_cnpj !~ '^([0-9]{11}|[0-9]{14})$';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_barbershops_cpf_cnpj_digits'
  ) THEN
    ALTER TABLE barbershops
      ADD CONSTRAINT chk_barbershops_cpf_cnpj_digits
      CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pending_registrations'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pending_registrations_cpf_cnpj_digits'
  ) THEN
    ALTER TABLE pending_registrations
      ADD CONSTRAINT chk_pending_registrations_cpf_cnpj_digits
      CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
  END IF;
END
$$;

COMMIT;
