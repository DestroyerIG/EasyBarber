-- CreateTable
CREATE TABLE "whatsapp_menu_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershop_id" UUID NOT NULL,
    "option_order" INTEGER NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "emoji" VARCHAR(50) NOT NULL DEFAULT '',
    "type" VARCHAR(20) NOT NULL DEFAULT 'custom',
    "handler" VARCHAR(100),
    "response_message" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_menu_options_barbershop_id_option_order_key" ON "whatsapp_menu_options"("barbershop_id", "option_order");

-- AddForeignKey
ALTER TABLE "whatsapp_menu_options" ADD CONSTRAINT "whatsapp_menu_options_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
