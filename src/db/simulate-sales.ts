// Giả lập người mua: bán một phần ghế của mỗi event đang mở bán, phân bố theo zone/hạng vé.
// Kế hoạch cố định theo seed: chạy lại chỉ bán tiếp phần còn dở, không bán chồng. Database không phải localhost phải xác nhận
// SALES_CONFIRM=<host>. Tuỳ chọn: SALES_EVENT=<slug>, SALES_SEED=<số>, SALES_CONCURRENCY=<số>.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/lib/env";
import { events } from "./schema";
import { createPoolDb, isLocalDatabaseUrl } from "./client";
import { planSales } from "./sales/plan";
import { loadSaleSeats, sellGroups } from "./sales/sell";
import { databaseHost } from "./seed/guard";
import { hashString, seededRandom } from "./seed/seed-database";

// Hạng đắt nhất bán chạy nhất; event "hot" (demand cao) gần cháy vé ở hạng VIP
const TIER_RATES = [0.75, 0.55, 0.35, 0.2] as const;
const SOLD_OUT_CHANCE = 0.05;
const DEMAND_MIN = 0.6;
const DEMAND_SPREAD = 0.6;
const PROGRESS_EVERY = 500;
const MAX_ATTEMPTS = 3;

const optionsSchema = z.object({
  SALES_EVENT: z.string().min(1).optional(),
  SALES_SEED: z.coerce.number().int().default(20261010),
  SALES_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(16),
  SALES_CONFIRM: z.string().optional(),
});

function assertAllowed(url: string, confirm: string | undefined) {
  const host = databaseHost(url);
  if (isLocalDatabaseUrl(url) || confirm === host) return;
  throw new Error(
    `Refusing to write orders to ${host}; set SALES_CONFIRM=${host}`,
  );
}

type Options = z.infer<typeof optionsSchema>;
type AppDb = ReturnType<typeof createPoolDb>;

// Kết nối Neon đôi khi rớt giữa chừng; kế hoạch cố định theo seed nên chạy lại một event là an toàn
async function withRetry(slug: string, run: () => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        console.error(`- ${slug}: thất bại sau ${attempt} lần, bỏ qua`, error);
        return;
      }
      console.warn(`  ${slug}: lỗi lần ${attempt}, thử lại`);
    }
  }
}

async function sellEvent(
  db: AppDb,
  event: { id: string; slug: string },
  opts: Options,
) {
  const rng = seededRandom(opts.SALES_SEED ^ hashString(event.slug));
  const demand = DEMAND_MIN + rng() * DEMAND_SPREAD;
  const seats = await loadSaleSeats(db, event.id);
  const soldBefore = seats.filter((s) => !s.available).length;
  const groups = planSales(seats, {
    rng,
    tierRates: TIER_RATES,
    demand,
    soldOutChance: SOLD_OUT_CHANCE,
  });
  const started = Date.now();
  const result = await sellGroups(db, event.id, groups, {
    concurrency: opts.SALES_CONCURRENCY,
    onProgress: (done) => {
      if (done % PROGRESS_EVERY === 0)
        console.info(`  ${event.slug}: ${done}/${groups.length} đơn`);
    },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.info(
    `- ${event.slug}: +${result.orders} đơn (+${result.seats} ghế), đã bán ` +
      `${soldBefore + result.seats}/${seats.length} ` +
      `(${(((soldBefore + result.seats) / Math.max(1, seats.length)) * 100).toFixed(0)}%), ` +
      `${result.failed} lỗi, ${secs}s`,
  );
}

async function main() {
  const opts = optionsSchema.parse(process.env);
  assertAllowed(env.databaseUrl, opts.SALES_CONFIRM);
  const db = createPoolDb(env.databaseUrl, opts.SALES_CONCURRENCY);
  try {
    const onSale = await db
      .select({ id: events.id, slug: events.slug })
      .from(events)
      .where(eq(events.status, "on_sale"));
    const targets = onSale.filter(
      (e) => !opts.SALES_EVENT || e.slug === opts.SALES_EVENT,
    );
    if (targets.length === 0) throw new Error("Không có event on_sale phù hợp");

    for (const event of targets)
      await withRetry(event.slug, () => sellEvent(db, event, opts));
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Giả lập bán vé thất bại:", error);
  process.exitCode = 1;
});
