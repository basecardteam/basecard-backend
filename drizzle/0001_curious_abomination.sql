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
ALTER TABLE "farcaster_notifications" ADD CONSTRAINT "farcaster_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farcaster_notifications_user_fid_idx" ON "farcaster_notifications" USING btree ("user_id","fid");