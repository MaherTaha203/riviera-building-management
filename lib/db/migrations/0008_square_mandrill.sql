ALTER TABLE "rent_charges" DROP CONSTRAINT "rent_charges_contract_period_uq";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "late_fee_enabled" text DEFAULT 'false' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "late_fee_grace_days" numeric(5, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "late_fee_mode" text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "late_fee_rate" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD COLUMN "kind" text DEFAULT 'rent' NOT NULL;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD COLUMN "source_charge_id" integer;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_source_charge_id_rent_charges_id_fk" FOREIGN KEY ("source_charge_id") REFERENCES "public"."rent_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_contract_period_kind_uq" UNIQUE("contract_id","period_start","kind");--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_source_charge_uq" UNIQUE("source_charge_id");