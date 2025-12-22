CREATE TYPE "public"."client_type" AS ENUM('farcaster', 'baseapp', 'metamask');--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"client_type" "client_type" NOT NULL,
	"client_fid" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fid" integer;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_wallets_user_id_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_wallets_client_type_idx" ON "user_wallets" USING btree ("client_type");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_fid_unique" UNIQUE("fid");