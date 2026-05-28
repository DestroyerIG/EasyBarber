-- Add birth_date and address columns to clients (read/write path expected them but they never existed)
ALTER TABLE "clients" ADD COLUMN     "address" VARCHAR(500),
ADD COLUMN     "birth_date" DATE;
