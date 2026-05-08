-- AlterTable
ALTER TABLE "barbershop_settings" ALTER COLUMN "opening_time" SET DEFAULT '09:00:00'::time,
ALTER COLUMN "closing_time" SET DEFAULT '20:00:00'::time;
