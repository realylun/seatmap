CREATE TABLE "fps_samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"avg_fps" real NOT NULL,
	"p50_frame_ms" real NOT NULL,
	"p95_frame_ms" real NOT NULL,
	"long_frames" integer NOT NULL,
	"frames" integer NOT NULL,
	"interaction_ms" integer NOT NULL,
	"device_class" text NOT NULL,
	"dpr" real NOT NULL,
	"viewport_w" integer NOT NULL,
	"viewport_h" integer NOT NULL,
	"cores" integer,
	"memory_gb" real,
	"gpu" text,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fps_samples_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "fps_samples" ADD CONSTRAINT "fps_samples_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fps_samples_event_created_idx" ON "fps_samples" USING btree ("event_id","created_at");