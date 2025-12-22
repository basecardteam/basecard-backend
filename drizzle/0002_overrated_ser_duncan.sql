ALTER TABLE "quests" ALTER COLUMN "platform" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."platform";--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('FARCASTER', 'X', 'BASENAME', 'APP', 'GITHUB', 'LINKEDIN', 'WEBSITE');--> statement-breakpoint
ALTER TABLE "quests" ALTER COLUMN "platform" SET DATA TYPE "public"."platform" USING "platform"::"public"."platform";