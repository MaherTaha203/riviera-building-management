ALTER TABLE "accounts" DROP CONSTRAINT "accounts_kind_ck";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "type" text DEFAULT 'asset' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_type_idx" ON "accounts" USING btree ("type");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_type_ck" CHECK ("accounts"."type" in ('asset','liability','equity','income','expense'));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kind_ck" CHECK ("accounts"."kind" is null or "accounts"."kind" in ('cash','bank'));