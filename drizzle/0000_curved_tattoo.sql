CREATE TYPE "public"."client_type" AS ENUM('farcaster', 'baseapp', 'metamask');--> statement-breakpoint
CREATE TYPE "public"."earn_type" AS ENUM('bounty', 'project', 'hiring');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'ALWAYS');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('FARCASTER', 'X', 'BASENAME', 'APP', 'GITHUB', 'LINKEDIN', 'WEBSITE');--> statement-breakpoint
CREATE TYPE "public"."point_log_type" AS ENUM('QUEST_REWARD', 'MINT_BONUS', 'REFERRAL', 'ADMIN_ADJUST');--> statement-breakpoint
CREATE TYPE "public"."quest_status" AS ENUM('pending', 'submitted', 'claimable', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "basecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_owner" varchar(42) NOT NULL,
	"token_id" integer,
	"tx_hash" text,
	"nickname" varchar(256),
	"role" text,
	"bio" text,
	"image_uri" text,
	"socials" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "basecards_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_user_id" uuid NOT NULL,
	"collected_card_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_collection" UNIQUE("collector_user_id","collected_card_id")
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_hash" text NOT NULL,
	"block_number" integer NOT NULL,
	"block_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"event_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"processed" boolean DEFAULT false,
	"from_address" text,
	"to_address" text,
	"gas_used" text,
	"effective_gas_price" text,
	"tx_status" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "earn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "earn_type" NOT NULL,
	"is_open" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "farcaster_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fid" integer NOT NULL,
	"token" text NOT NULL,
	"url" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" varchar(100) NOT NULL,
	"user_id" uuid,
	"type" varchar(50) NOT NULL,
	"target_id" varchar(100),
	"recipient_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_logs_notification_id_unique" UNIQUE("notification_id")
);
--> statement-breakpoint
CREATE TABLE "point_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"type" "point_log_type" NOT NULL,
	"quest_id" uuid,
	"event_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"reward_amount" integer DEFAULT 0 NOT NULL,
	"platform" "platform" NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"frequency" "frequency" DEFAULT 'ONCE' NOT NULL,
	"cooldown_second" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_id" uuid NOT NULL,
	"status" "quest_status" DEFAULT 'pending',
	"metadata" jsonb,
	"completed_at" timestamp,
	CONSTRAINT "unique_user_quest" UNIQUE("user_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"client_type" "client_type" NOT NULL,
	"client_fid" integer,
	"miniapp_added" boolean DEFAULT false,
	"notification_enabled" boolean DEFAULT false,
	"notification_token" varchar(255),
	"notification_url" varchar(512),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"fid" integer,
	"total_points" integer DEFAULT 0 NOT NULL,
	"is_new_user" boolean DEFAULT true,
	"has_minted_card" boolean DEFAULT false,
	"farcaster_pfp_url" varchar(512),
	"farcaster_pfp_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_fid_unique" UNIQUE("fid")
);
--> statement-breakpoint
ALTER TABLE "basecards" ADD CONSTRAINT "basecards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_collector_user_id_users_id_fk" FOREIGN KEY ("collector_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_collected_card_id_basecards_id_fk" FOREIGN KEY ("collected_card_id") REFERENCES "public"."basecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earn" ADD CONSTRAINT "earn_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farcaster_notifications" ADD CONSTRAINT "farcaster_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_event_id_contract_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."contract_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "basecards_user_id_idx" ON "basecards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contract_events_tx_hash_idx" ON "contract_events" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "contract_events_block_hash_idx" ON "contract_events" USING btree ("block_hash");--> statement-breakpoint
CREATE INDEX "contract_events_event_name_idx" ON "contract_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "farcaster_notifications_user_fid_idx" ON "farcaster_notifications" USING btree ("user_id","fid");--> statement-breakpoint
CREATE INDEX "user_wallets_user_id_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_wallets_client_type_idx" ON "user_wallets" USING btree ("client_type");