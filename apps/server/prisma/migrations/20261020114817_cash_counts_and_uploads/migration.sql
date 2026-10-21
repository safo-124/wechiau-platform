-- CreateTable
CREATE TABLE "cash_count" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,
    "note" TEXT,
    "counted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload" (
    "id" UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_count_recorded_by_counted_at_idx" ON "cash_count"("recorded_by", "counted_at");

-- CreateIndex
CREATE INDEX "upload_table_name_row_id_idx" ON "upload"("table_name", "row_id");
