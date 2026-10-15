import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const eventCategory = pgEnum("event_category", [
  "sports",
  "music",
  "shows",
]);
export const eventStatus = pgEnum("event_status", [
  "draft",
  "on_sale",
  "ended",
]);
export const seatStatus = pgEnum("seat_status", [
  "available",
  "held",
  "sold",
  "blocked",
]);
export const holdStatus = pgEnum("hold_status", [
  "active",
  "converted",
  "released",
]);
export const orderStatus = pgEnum("order_status", ["paid"]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  createdAt: createdAt(),
});

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id),
  name: text("name").notNull(),
  editorState: jsonb("editor_state"),
  backgroundImageUrl: text("background_image_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    version: integer("version").notNull(),
    geometryUrl: text("geometry_url").notNull(),
    // overview.json tải theo tầng (domain/venue/overview.ts); null = version publish trước khi có
    overviewUrl: text("overview_url"),
    sectionCount: integer("section_count").notNull(),
    seatCount: integer("seat_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("template_versions_template_version_uq").on(t.templateId, t.version),
  ],
);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: eventCategory("category").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id),
  templateVersionId: uuid("template_version_id")
    .notNull()
    .references(() => templateVersions.id),
  imageUrl: text("image_url"),
  status: eventStatus("status").notNull().default("draft"),
  isTrending: boolean("is_trending").notNull().default(false),
  createdAt: createdAt(),
});

export const priceTiers = pgTable("price_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  color: text("color").notNull(),
});

export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: holdStatus("status").notNull().default("active"),
    seatCount: integer("seat_count").notNull().default(0),
    clientIp: text("client_ip"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("holds_active_event_session_uq")
      .on(t.eventId, t.sessionId)
      .where(sql`${t.status} = 'active'`),
    index("holds_client_ip_idx").on(t.clientIp, t.createdAt),
  ],
);

export const eventSeats = pgTable(
  "event_seats",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    row: text("row").notNull(),
    seat: text("seat").notNull(),
    tierId: uuid("tier_id").references(() => priceTiers.id, {
      onDelete: "set null",
    }),
    status: seatStatus("status").notNull().default("available"),
    holdId: uuid("hold_id").references(() => holds.id, {
      onDelete: "set null",
    }),
    heldUntil: timestamp("held_until", { withTimezone: true }),
    /** Tier price snapshotted when the seat is held; the order is charged this. */
    heldPrice: integer("held_price"),
  },
  (t) => [
    unique("event_seats_event_section_row_seat_uq").on(
      t.eventId,
      t.section,
      t.row,
      t.seat,
    ),
    index("event_seats_event_status_idx").on(t.eventId, t.status),
  ],
);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  holdId: uuid("hold_id")
    .notNull()
    .unique()
    .references(() => holds.id),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  total: integer("total").notNull(),
  status: orderStatus("status").notNull().default("paid"),
  createdAt: createdAt(),
});

export const orderItems = pgTable("order_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  eventSeatId: bigint("event_seat_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => eventSeats.id),
  price: integer("price").notNull(),
});

/** Telemetry FPS seatmap: 1 dòng / phiên xem (upsert theo session_id) */
export const fpsSamples = pgTable(
  "fps_samples",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: text("session_id").notNull().unique(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    avgFps: real("avg_fps").notNull(),
    p50FrameMs: real("p50_frame_ms").notNull(),
    p95FrameMs: real("p95_frame_ms").notNull(),
    longFrames: integer("long_frames").notNull(),
    frames: integer("frames").notNull(),
    interactionMs: integer("interaction_ms").notNull(),
    deviceClass: text("device_class").notNull(),
    dpr: real("dpr").notNull(),
    viewportW: integer("viewport_w").notNull(),
    viewportH: integer("viewport_h").notNull(),
    cores: integer("cores"),
    memoryGb: real("memory_gb"),
    gpu: text("gpu"),
    userAgent: text("user_agent").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("fps_samples_event_created_idx").on(t.eventId, t.createdAt)],
);

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type TemplateVersion = typeof templateVersions.$inferSelect;
export type NewTemplateVersion = typeof templateVersions.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type PriceTier = typeof priceTiers.$inferSelect;
export type NewPriceTier = typeof priceTiers.$inferInsert;
export type EventSeat = typeof eventSeats.$inferSelect;
export type NewEventSeat = typeof eventSeats.$inferInsert;
export type Hold = typeof holds.$inferSelect;
export type NewHold = typeof holds.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type FpsSample = typeof fpsSamples.$inferSelect;
export type NewFpsSample = typeof fpsSamples.$inferInsert;
