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
ALTER TABLE "user_wallets" ADD COLUMN "notification_token" varchar(255);--> statement-breakpoint
ALTER TABLE "user_wallets" ADD COLUMN "notification_url" varchar(512);--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;