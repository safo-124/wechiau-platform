-- CreateTable
CREATE TABLE "case_note" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "device_id" TEXT NOT NULL,
    "recorded_by" UUID,
    "health_case_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "case_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_note_health_case_id_created_at_idx" ON "case_note"("health_case_id", "created_at");

-- AddForeignKey
ALTER TABLE "case_note" ADD CONSTRAINT "case_note_health_case_id_fkey" FOREIGN KEY ("health_case_id") REFERENCES "health_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
