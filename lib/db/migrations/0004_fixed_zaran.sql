CREATE TABLE "rent_charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"allocated_ils" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_charges_contract_period_uq" UNIQUE("contract_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "receipt_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_voucher_id" integer NOT NULL,
	"rent_charge_id" integer NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_voucher_id_receipt_vouchers_id_fk" FOREIGN KEY ("receipt_voucher_id") REFERENCES "public"."receipt_vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_rent_charge_id_rent_charges_id_fk" FOREIGN KEY ("rent_charge_id") REFERENCES "public"."rent_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rent_charges_tenant_id_idx" ON "rent_charges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rent_charges_contract_id_idx" ON "rent_charges" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "receipt_allocations_receipt_id_idx" ON "receipt_allocations" USING btree ("receipt_voucher_id");--> statement-breakpoint
CREATE INDEX "receipt_allocations_charge_id_idx" ON "receipt_allocations" USING btree ("rent_charge_id");