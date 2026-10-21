-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'field_agent', 'vet', 'farmer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('dga', 'wlx', 'eng');

-- CreateEnum
CREATE TYPE "FarmerStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BirdCountKind" AS ENUM ('reported', 'verified');

-- CreateEnum
CREATE TYPE "BirdCountSource" AS ENUM ('registration', 'visit', 'vaccination', 'farmer_app', 'voice_line');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('wholesaler', 'hotel', 'school');

-- CreateEnum
CREATE TYPE "Fund" AS ENUM ('egg', 'vaccine');

-- CreateEnum
CREATE TYPE "LedgerSource" AS ENUM ('collection', 'sale_payment', 'vaccine_payment', 'vaccine_purchase', 'grant', 'adjustment');

-- CreateEnum
CREATE TYPE "StockReason" AS ENUM ('received', 'used', 'wasted', 'adjustment');

-- CreateEnum
CREATE TYPE "StockSource" AS ENUM ('vaccination', 'cold_chain_reading');

-- CreateEnum
CREATE TYPE "ReadingPlace" AS ENUM ('pickup', 'storage', 'farm');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('low', 'medium', 'urgent');

-- CreateEnum
CREATE TYPE "CaseChannel" AS ENUM ('app', 'voice', 'visit');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('from_farmer', 'to_farmer');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('voice', 'text', 'notice');

-- CreateEnum
CREATE TYPE "MessageDelivery" AS ENUM ('app', 'sms', 'call');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'approved', 'sent');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL,
    "farmer_id" UUID,
    "status" "UserStatus" NOT NULL,
    "password_hash" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "digital_address" TEXT,
    "landmark" TEXT,
    "joined_on" DATE NOT NULL,
    "status" "FarmerStatus" NOT NULL,
    "consent_training" BOOLEAN NOT NULL,
    "consent_recorded_at" TIMESTAMPTZ(3),

    CONSTRAINT "farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_assignment" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vet_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "visited_at" TIMESTAMPTZ(3) NOT NULL,
    "deaths" INTEGER NOT NULL,
    "suspected_cause" TEXT,
    "notes" TEXT,
    "photo_uri" TEXT,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bird_count" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "count" INTEGER NOT NULL,
    "kind" "BirdCountKind" NOT NULL,
    "source_type" "BirdCountSource" NOT NULL,
    "source_id" UUID,
    "counted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bird_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "collected_at" TIMESTAMPTZ(3) NOT NULL,
    "crates" INTEGER NOT NULL,
    "price_per_crate" INTEGER NOT NULL,
    "amount_paid" INTEGER NOT NULL,
    "receipt_sms_id" UUID,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "name" TEXT NOT NULL,
    "type" "BuyerType" NOT NULL,
    "phone" TEXT,
    "location" TEXT,

    CONSTRAINT "buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "buyer_id" UUID NOT NULL,
    "sold_at" TIMESTAMPTZ(3) NOT NULL,
    "crates" INTEGER NOT NULL,
    "price_per_crate" INTEGER NOT NULL,
    "due_on" DATE,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payment" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "sale_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "fund" "Fund" NOT NULL,
    "amount" INTEGER NOT NULL,
    "source_type" "LedgerSource" NOT NULL,
    "source_id" UUID,
    "note" TEXT,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_handover" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "handed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_round" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "is_free" BOOLEAN NOT NULL,
    "price_per_dose" INTEGER,

    CONSTRAINT "vaccination_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "birds_vaccinated" INTEGER NOT NULL,
    "farm_reading_id" UUID,
    "vaccinated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_batch" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "batch_no" TEXT NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "expiry_on" DATE NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vaccine_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_stock_entry" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "batch_id" UUID NOT NULL,
    "doses" INTEGER NOT NULL,
    "reason" "StockReason" NOT NULL,
    "source_type" "StockSource",
    "source_id" UUID,

    CONSTRAINT "vaccine_stock_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cold_chain_reading" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "temp_c" DOUBLE PRECISION NOT NULL,
    "place" "ReadingPlace" NOT NULL,
    "farmer_id" UUID,
    "round_id" UUID,
    "read_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cold_chain_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_payment" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vaccine_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_case" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "channel" "CaseChannel" NOT NULL,
    "triage_suggested" "TriageLevel",
    "triage" "TriageLevel",
    "triage_confirmed_by" UUID,
    "assigned_vet_id" UUID,
    "status" "CaseStatus" NOT NULL,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "follow_up_on" DATE,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "health_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "farmer_id" UUID NOT NULL,
    "health_case_id" UUID,
    "direction" "MessageDirection" NOT NULL,
    "sender_id" UUID,
    "kind" "MessageKind" NOT NULL,
    "body" TEXT,
    "audio_uri" TEXT,
    "audio_seconds" INTEGER,
    "transcript" TEXT,
    "translation" TEXT,
    "delivery" "MessageDelivery" NOT NULL,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_outbox" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "to_phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL,
    "attempts" INTEGER NOT NULL,

    CONSTRAINT "sms_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_report" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "month" TEXT NOT NULL,
    "draft_text" TEXT NOT NULL,
    "final_text" TEXT,
    "status" "ReportStatus" NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),

    CONSTRAINT "monthly_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_farmer_id_key" ON "user"("farmer_id");

-- CreateIndex
CREATE INDEX "vet_assignment_farmer_id_assigned_at_idx" ON "vet_assignment"("farmer_id", "assigned_at");

-- CreateIndex
CREATE INDEX "vet_assignment_vet_id_idx" ON "vet_assignment"("vet_id");

-- CreateIndex
CREATE INDEX "visit_farmer_id_visited_at_idx" ON "visit"("farmer_id", "visited_at");

-- CreateIndex
CREATE INDEX "bird_count_farmer_id_kind_counted_at_idx" ON "bird_count"("farmer_id", "kind", "counted_at");

-- CreateIndex
CREATE INDEX "collection_farmer_id_collected_at_idx" ON "collection"("farmer_id", "collected_at");

-- CreateIndex
CREATE INDEX "collection_recorded_by_idx" ON "collection"("recorded_by");

-- CreateIndex
CREATE INDEX "sale_buyer_id_sold_at_idx" ON "sale"("buyer_id", "sold_at");

-- CreateIndex
CREATE INDEX "sale_payment_sale_id_idx" ON "sale_payment"("sale_id");

-- CreateIndex
CREATE INDEX "ledger_entry_fund_created_at_idx" ON "ledger_entry"("fund", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entry_source_type_source_id_idx" ON "ledger_entry"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "ledger_entry_recorded_by_idx" ON "ledger_entry"("recorded_by");

-- CreateIndex
CREATE INDEX "cash_handover_from_user_id_idx" ON "cash_handover"("from_user_id");

-- CreateIndex
CREATE INDEX "cash_handover_to_user_id_idx" ON "cash_handover"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccination_farm_reading_id_key" ON "vaccination"("farm_reading_id");

-- CreateIndex
CREATE INDEX "vaccination_farmer_id_round_id_idx" ON "vaccination"("farmer_id", "round_id");

-- CreateIndex
CREATE INDEX "vaccine_stock_entry_batch_id_idx" ON "vaccine_stock_entry"("batch_id");

-- CreateIndex
CREATE INDEX "cold_chain_reading_read_at_idx" ON "cold_chain_reading"("read_at");

-- CreateIndex
CREATE INDEX "vaccine_payment_farmer_id_round_id_idx" ON "vaccine_payment"("farmer_id", "round_id");

-- CreateIndex
CREATE INDEX "health_case_status_triage_idx" ON "health_case"("status", "triage");

-- CreateIndex
CREATE INDEX "health_case_farmer_id_idx" ON "health_case"("farmer_id");

-- CreateIndex
CREATE INDEX "health_case_assigned_vet_id_idx" ON "health_case"("assigned_vet_id");

-- CreateIndex
CREATE INDEX "message_farmer_id_created_at_idx" ON "message"("farmer_id", "created_at");

-- CreateIndex
CREATE INDEX "message_health_case_id_idx" ON "message"("health_case_id");

-- CreateIndex
CREATE INDEX "sms_outbox_status_idx" ON "sms_outbox"("status");

-- CreateIndex
CREATE UNIQUE INDEX "setting_key_key" ON "setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_report_month_key" ON "monthly_report"("month");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_assignment" ADD CONSTRAINT "vet_assignment_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bird_count" ADD CONSTRAINT "bird_count_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment" ADD CONSTRAINT "sale_payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "vaccination_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "vaccine_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination" ADD CONSTRAINT "vaccination_farm_reading_id_fkey" FOREIGN KEY ("farm_reading_id") REFERENCES "cold_chain_reading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_stock_entry" ADD CONSTRAINT "vaccine_stock_entry_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "vaccine_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cold_chain_reading" ADD CONSTRAINT "cold_chain_reading_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cold_chain_reading" ADD CONSTRAINT "cold_chain_reading_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "vaccination_round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_payment" ADD CONSTRAINT "vaccine_payment_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_payment" ADD CONSTRAINT "vaccine_payment_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "vaccination_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_case" ADD CONSTRAINT "health_case_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_health_case_id_fkey" FOREIGN KEY ("health_case_id") REFERENCES "health_case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
