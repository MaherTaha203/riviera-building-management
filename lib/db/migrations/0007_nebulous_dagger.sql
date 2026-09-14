ALTER TABLE "financial_movements" ADD COLUMN "entry_id" text;--> statement-breakpoint
CREATE INDEX "financial_movements_entry_idx" ON "financial_movements" USING btree ("entry_id");