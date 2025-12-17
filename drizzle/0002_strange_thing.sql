ALTER TABLE "contract_events" ADD COLUMN "from_address" text;--> statement-breakpoint
ALTER TABLE "contract_events" ADD COLUMN "to_address" text;--> statement-breakpoint
ALTER TABLE "contract_events" ADD COLUMN "gas_used" text;--> statement-breakpoint
ALTER TABLE "contract_events" ADD COLUMN "effective_gas_price" text;--> statement-breakpoint
ALTER TABLE "contract_events" ADD COLUMN "tx_status" text;--> statement-breakpoint
CREATE INDEX "contract_events_event_name_idx" ON "contract_events" USING btree ("event_name");