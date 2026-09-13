CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_number" text NOT NULL,
	"floor" text NOT NULL,
	"type" text DEFAULT 'office' NOT NULL,
	"area" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'vacant' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_unit_number_unique" UNIQUE("unit_number")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'individual' NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"id_number" text,
	"address" text,
	"notes" text,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"rent_amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1' NOT NULL,
	"rent_amount_ils" numeric(14, 2) NOT NULL,
	"payment_frequency" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"deposit_amount" numeric(14, 2),
	"payment_count" integer,
	"additional_terms" text,
	"payment_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "receipt_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_number" text NOT NULL,
	"date" date NOT NULL,
	"payer_name" text NOT NULL,
	"tenant_id" integer,
	"contract_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1' NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"bank_account_id" integer,
	"cheque_number" text,
	"bank_name" text,
	"cheque_date" date,
	"due_date" date,
	"account_holder_name" text,
	"previous_balance" numeric(14, 2),
	"new_balance" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
CREATE TABLE "payment_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_number" text NOT NULL,
	"date" date NOT NULL,
	"beneficiary_name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1' NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"category" text NOT NULL,
	"bank_account_id" integer,
	"cheque_number" text,
	"bank_name" text,
	"cheque_date" date,
	"due_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"balance_ils" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" serial PRIMARY KEY NOT NULL,
	"cheque_number" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1' NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"bank_name" text NOT NULL,
	"cheque_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"drawer_name" text NOT NULL,
	"tenant_id" integer,
	"bank_account_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_type" text DEFAULT 'general' NOT NULL,
	"entity_id" integer,
	"file_type" text NOT NULL,
	"file_size" integer,
	"file_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"usd_to_ils" numeric(10, 4) DEFAULT '3.7' NOT NULL,
	"jod_to_ils" numeric(10, 4) DEFAULT '5.22' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_name" text DEFAULT 'Riviera Commercial Building' NOT NULL,
	"building_address" text DEFAULT '' NOT NULL,
	"default_currency" text DEFAULT 'ILS' NOT NULL,
	"phone" text,
	"email" text,
	"tax_number" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contracts_tenant_id_idx" ON "contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contracts_unit_id_idx" ON "contracts" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "receipt_vouchers_tenant_id_idx" ON "receipt_vouchers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "receipt_vouchers_contract_id_idx" ON "receipt_vouchers" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "receipt_vouchers_bank_account_id_idx" ON "receipt_vouchers" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "payment_vouchers_bank_account_id_idx" ON "payment_vouchers" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "cheques_tenant_id_idx" ON "cheques" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cheques_bank_account_id_idx" ON "cheques" USING btree ("bank_account_id");