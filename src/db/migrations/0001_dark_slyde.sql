ALTER TABLE "holds" ADD COLUMN "seat_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "client_ip" text;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "holds_active_event_session_uq" ON "holds" USING btree ("event_id","session_id") WHERE "holds"."status" = 'active';--> statement-breakpoint
CREATE INDEX "holds_client_ip_idx" ON "holds" USING btree ("client_ip","created_at");