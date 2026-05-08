/*
  Warnings:

  - A unique constraint covering the columns `[supabase_user_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "barbershop_settings" ALTER COLUMN "opening_time" SET DEFAULT '09:00:00'::time,
ALTER COLUMN "closing_time" SET DEFAULT '20:00:00'::time;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "supabase_user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_user_id_key" ON "users"("supabase_user_id");
