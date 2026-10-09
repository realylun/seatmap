// Dữ liệu demo: 3 venue (Hà Nội dùng map Rosetta, TP.HCM dùng map mẫu, AT&T Stadium dựng từ SVG),
// 11 event, bảng giá theo loại.

export type SeedMapKey = "rosetta" | "sample" | "att";

export type SeedVenue = {
  readonly key: SeedMapKey;
  readonly name: string;
  readonly city: string;
  readonly address: string;
  readonly templateName: string;
};

export type SeedTier = {
  readonly name: string;
  readonly price: number;
  readonly color: string;
};

export type SeedEvent = {
  readonly slug: string;
  readonly name: string;
  readonly category: "sports" | "music" | "shows";
  readonly venue: SeedMapKey;
  /** Số ngày kể từ thời điểm seed (luôn trong 60 ngày tới) */
  readonly inDays: number;
  readonly trending: boolean;
};

export const SEED_VENUES: readonly SeedVenue[] = [
  {
    key: "rosetta",
    name: "Rosetta Arena",
    city: "Hanoi",
    address: "1 Trần Duy Hưng, Cầu Giấy, Hà Nội",
    templateName: "Rosetta — sơ đồ chuẩn",
  },
  {
    key: "sample",
    name: "Saigon Hall",
    city: "Ho Chi Minh City",
    address: "12 Nguyễn Huệ, Quận 1, TP.HCM",
    templateName: "Saigon Hall — khán đài chính",
  },
  {
    key: "att",
    name: "AT&T Stadium",
    city: "Arlington, TX",
    address: "1 AT&T Way, Arlington, TX 76011",
    templateName: "AT&T Stadium — SVG",
  },
];

export const SEED_TIERS: Readonly<
  Record<SeedEvent["category"], readonly SeedTier[]>
> = {
  sports: [
    { name: "VIP", price: 2_500_000, color: "#7c3aed" },
    { name: "Hạng A", price: 1_500_000, color: "#2563eb" },
    { name: "Hạng B", price: 900_000, color: "#16a34a" },
    { name: "Phổ thông", price: 450_000, color: "#f59e0b" },
  ],
  music: [
    { name: "VIP", price: 3_000_000, color: "#db2777" },
    { name: "CAT 1", price: 1_800_000, color: "#7c3aed" },
    { name: "CAT 2", price: 1_200_000, color: "#2563eb" },
    { name: "CAT 3", price: 650_000, color: "#16a34a" },
  ],
  shows: [
    { name: "Premium", price: 1_600_000, color: "#9333ea" },
    { name: "Standard", price: 900_000, color: "#0891b2" },
    { name: "Economy", price: 500_000, color: "#65a30d" },
  ],
};

export const SEED_EVENTS: readonly SeedEvent[] = [
  {
    slug: "vietnam-vs-thailand-friendly",
    name: "Vietnam vs Thailand — International Friendly",
    category: "sports",
    venue: "rosetta",
    inDays: 5,
    trending: true,
  },
  {
    slug: "skyline-live-tour-hanoi",
    name: "Skyline Live Tour 2026",
    category: "music",
    venue: "rosetta",
    inDays: 12,
    trending: true,
  },
  {
    slug: "hanoi-basketball-finals",
    name: "Hanoi Basketball Finals",
    category: "sports",
    venue: "rosetta",
    inDays: 19,
    trending: true,
  },
  {
    slug: "cirque-lumiere-hanoi",
    name: "Cirque Lumière",
    category: "shows",
    venue: "rosetta",
    inDays: 26,
    trending: false,
  },
  {
    slug: "indie-night-hanoi",
    name: "Indie Night Hanoi",
    category: "music",
    venue: "rosetta",
    inDays: 33,
    trending: false,
  },
  {
    slug: "saigon-comets-vs-hanoi-dragons",
    name: "Saigon Comets vs Hanoi Dragons",
    category: "sports",
    venue: "sample",
    inDays: 40,
    trending: true,
  },
  {
    slug: "monsoon-jazz-festival",
    name: "Monsoon Jazz Festival",
    category: "music",
    venue: "sample",
    inDays: 47,
    trending: true,
  },
  {
    slug: "lion-dance-spectacular",
    name: "The Lion Dance Spectacular",
    category: "shows",
    venue: "sample",
    inDays: 54,
    trending: false,
  },
  {
    slug: "karol-g-tropitour-att-stadium",
    name: "KAROL G - VIAJANDO POR EL MUNDO TROPITOUR",
    category: "music",
    venue: "att",
    inDays: 8,
    trending: true,
  },
  {
    slug: "dallas-cowboys-vs-philadelphia-eagles",
    name: "Dallas Cowboys vs Philadelphia Eagles",
    category: "sports",
    venue: "att",
    inDays: 22,
    trending: true,
  },
  {
    slug: "monster-jam-arlington",
    name: "Monster Jam Arlington",
    category: "shows",
    venue: "att",
    inDays: 44,
    trending: false,
  },
];

/** Giờ mở màn 19:30 giờ Việt Nam (UTC+7) */
export const SHOW_TIME_UTC = { hours: 12, minutes: 30 } as const;

export const eventImageUrl = (slug: string) =>
  `https://picsum.photos/seed/${slug}/1200/675`;
