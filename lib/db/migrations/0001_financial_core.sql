CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"opening_balance_ils" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_date" date,
	"opening_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_kind_ck" CHECK ("accounts"."kind" in ('cash','bank'))
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" integer,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_periods_status_ck" CHECK ("financial_periods"."status" in ('open','closed'))
);
--> statement-breakpoint
CREATE TABLE "financial_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"account_id" integer NOT NULL,
	"period_id" integer,
	"txn_date" date NOT NULL,
	"amount_ils" numeric(14, 2) NOT NULL,
	"direction" text NOT NULL,
	"original_amount" numeric(14, 2),
	"original_currency" text,
	"fx_rate" numeric(10, 4),
	"related_party_type" text,
	"related_party_id" integer,
	"reference" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"reverses_id" integer,
	"idempotency_key" text,
	"created_by" integer,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_movements_direction_ck" CHECK ("financial_movements"."direction" in ('debit','credit')),
	CONSTRAINT "financial_movements_status_ck" CHECK ("financial_movements"."status" in ('posted','reversed')),
	CONSTRAINT "financial_movements_amount_ck" CHECK ("financial_movements"."amount_ils" >= 0)
);
--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_period_id_financial_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."financial_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_reverses_id_financial_movements_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."financial_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_kind_idx" ON "accounts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "financial_periods_status_idx" ON "financial_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "financial_movements_account_idx" ON "financial_movements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "financial_movements_period_idx" ON "financial_movements" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "financial_movements_source_idx" ON "financial_movements" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "financial_movements_party_idx" ON "financial_movements" USING btree ("related_party_type","related_party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_movements_idempotency_uk" ON "financial_movements" USING btree ("idempotency_key");