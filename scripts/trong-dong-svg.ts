// Sinh SVG sơ đồ SVĐ Trống Đồng (Hà Nội, ~135.000 chỗ, đang xây — chưa có sơ đồ chính thức).
// Sơ đồ GIẢ LẬP: lòng sân tròn kiểu mặt trống đồng, 3 tầng khán đài, ghế sinh tự động từ data-*.
// Cách dùng: pnpm svg:trong-dong [output.svg]
import { writeFileSync } from "node:fs";
import { buildVenue } from "../src/domain/venue/venue-file";
import { blockFromSvg, svgToDrafts } from "../src/domain/venue/svg/svg-venue";

type Point = readonly [number, number];
/** Biên khán đài: siêu elip |x/a|^n + |y/b|^n = 1 (n=2 là elip, n lớn → chữ nhật bo góc) */
type Boundary = { readonly a: number; readonly b: number; readonly n: number };
type Tier = {
  readonly level: number;
  readonly sections: number;
  readonly inner: Boundary;
  readonly outer: Boundary;
  readonly fill: string;
};

const SIZE = 2000;
const CENTER = SIZE / 2;
// Map cao 40 đơn vị (IMAGE_HALF_HEIGHT * 2) trên 2000 px → 1 px = 0.02 đơn vị
const UNITS_PER_PX = 0.02;
const SEAT_SPACING = 0.071;
const PITCH = { w: 525, h: 340 }; // 105 × 68 m, 5 px/m
const RIM = { inner: 840, outer: 960 };
const RAYS = 14; // ngôi sao 14 cánh giữa mặt trống Đông Sơn
const CAPACITY = 135_000; // sức chứa công bố; phần lẻ so với ghế tự sinh bù vào row dài nhất

const TIERS: readonly Tier[] = [
  {
    level: 1,
    sections: 48,
    inner: { a: 315, b: 215, n: 4 },
    outer: { a: 480, b: 420, n: 3 },
    fill: "#c98b4a",
  },
  {
    level: 2,
    sections: 48,
    inner: { a: 500, b: 445, n: 2.8 },
    outer: { a: 640, b: 610, n: 2.3 },
    fill: "#b0713a",
  },
  {
    level: 3,
    sections: 64,
    inner: { a: 660, b: 632, n: 2.2 },
    outer: { a: 820, b: 820, n: 2 },
    fill: "#8f5a2c",
  },
];

const round = (v: number) => Math.round(v * 10) / 10;
const fmt = ([x, y]: Point) => `${round(x)},${round(y)}`;

function radius({ a, b, n }: Boundary, theta: number): number {
  // θ đo từ hướng bắc: a là bán trục ngang (sin), b là bán trục dọc (cos)
  const x = Math.abs(Math.sin(theta) / a) ** n;
  const y = Math.abs(Math.cos(theta) / b) ** n;
  return (x + y) ** (-1 / n);
}

/** Góc 0 ở chính bắc (trên), tăng theo chiều kim đồng hồ */
function at(boundary: Boundary, theta: number): Point {
  const r = radius(boundary, theta);
  return [CENTER + r * Math.sin(theta), CENTER - r * Math.cos(theta)];
}

/** data-overrides theo id khu, vd. "24:31" — chỉnh số ghế row cuối cho tổng khớp CAPACITY */
type Overrides = ReadonlyMap<string, string>;

function sectionSvg(tier: Tier, index: number, overrides: Overrides): string {
  const step = (2 * Math.PI) / tier.sections;
  // Lệch nửa ô để khu 01 nằm giữa khán đài bắc
  const [t1, t2] = [(index - 0.5) * step, (index + 0.5) * step];
  const ring = [
    at(tier.inner, t1),
    at(tier.inner, t2),
    at(tier.outer, t2),
    at(tier.outer, t1),
  ];
  // Cạnh 0 = cạnh trong (về phía sân). Khai báo rõ vì heuristic facingEdge ưu tiên cạnh dài,
  // mà khu hình quạt có cạnh ngoài dài hơn → row 1 sẽ bị đặt ở mép ngoài
  const depth =
    (radius(tier.outer, t1) - radius(tier.inner, t1)) * UNITS_PER_PX;
  const rows = Math.max(1, Math.round(depth / SEAT_SPACING));
  const id = `${tier.level}${String(index + 1).padStart(2, "0")}`;
  const mid = index * step;
  const r = (radius(tier.inner, mid) + radius(tier.outer, mid)) / 2;
  const [lx, ly] = [CENTER + r * Math.sin(mid), CENTER - r * Math.cos(mid)];
  const d = `M${ring.map(fmt).join(" L")} Z`.replaceAll(",", " ");
  const override = overrides.get(id);
  const extra = override ? ` data-overrides="${override}"` : "";
  return [
    `  <g data-section="${id}" data-rows="${rows}" data-row-start="1" data-front-edge="0" data-seat-spacing="${SEAT_SPACING}"${extra}>`,
    `    <path data-role="outline" d="${d}" fill="${tier.fill}" stroke="#3b2414" stroke-width="1"/>`,
    `    <text data-role="label" x="${round(lx)}" y="${round(ly)}" font-size="11" text-anchor="middle" dominant-baseline="middle" fill="#fff4e0">${id}</text>`,
    "  </g>",
  ].join("\n");
}

/** Vành trống: dải răng cưa + vòng chấm, hoạ tiết Đông Sơn (chỉ trang trí, không phải dữ liệu) */
function drumRim(): string {
  const teeth = 120;
  const mid = (RIM.inner + RIM.outer) / 2;
  const sawtooth = Array.from({ length: teeth * 2 }, (_, i) => {
    const theta = (i * Math.PI) / teeth;
    const r = i % 2 === 0 ? mid - 18 : mid + 18;
    return fmt([CENTER + r * Math.sin(theta), CENTER - r * Math.cos(theta)]);
  }).join(" ");
  const dots = Array.from({ length: 90 }, (_, i) => {
    const theta = (i * 2 * Math.PI) / 90;
    const r = RIM.outer - 14;
    return `<circle cx="${round(CENTER + r * Math.sin(theta))}" cy="${round(CENTER - r * Math.cos(theta))}" r="3" fill="#e8c27a"/>`;
  }).join("");
  return [
    '  <g id="drum-rim">',
    `    <circle cx="${CENTER}" cy="${CENTER}" r="${RIM.outer}" fill="#6b3f1d"/>`,
    `    <circle cx="${CENTER}" cy="${CENTER}" r="${RIM.inner}" fill="#2a1a0e"/>`,
    `    <polygon points="${sawtooth}" fill="none" stroke="#e8c27a" stroke-width="3"/>`,
    `    ${dots}`,
    "  </g>",
  ].join("\n");
}

/** Sân cỏ + ngôi sao 14 cánh giữa sân (sao chỉ trang trí, nằm ngoài group field) */
function pitch(): string {
  const [x, y] = [CENTER - PITCH.w / 2, CENTER - PITCH.h / 2];
  const star = Array.from({ length: RAYS * 2 }, (_, i) => {
    const theta = (i * Math.PI) / RAYS;
    const r = i % 2 === 0 ? 90 : 30;
    return fmt([CENTER + r * Math.sin(theta), CENTER - r * Math.cos(theta)]);
  }).join(" ");
  const apron = Array.from({ length: 180 }, (_, i) =>
    fmt(at(TIERS[0].inner, (i * 2 * Math.PI) / 180)),
  ).join(" ");
  return [
    `  <polygon id="apron" points="${apron}" fill="#2f6e2b"/>`,
    `  <rect id="field" x="${x}" y="${y}" width="${PITCH.w}" height="${PITCH.h}" fill="#3f8f3a" stroke="#ffffff" stroke-width="3"/>`,
    '  <g id="pitch-marks" fill="none" stroke="#ffffff" stroke-width="2">',
    `    <line x1="${CENTER}" y1="${y}" x2="${CENTER}" y2="${y + PITCH.h}"/>`,
    `    <circle cx="${CENTER}" cy="${CENTER}" r="46"/>`,
    `    <polygon points="${star}" fill="#e8c27a" fill-opacity="0.35" stroke="#e8c27a"/>`,
    "  </g>",
  ].join("\n");
}

function trongDongSvg(overrides: Overrides = new Map()): string {
  const sections = TIERS.flatMap((tier) =>
    Array.from({ length: tier.sections }, (_, i) =>
      sectionSvg(tier, i, overrides),
    ),
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`,
    "  <!-- SVĐ Trống Đồng — sơ đồ GIẢ LẬP (chưa có sơ đồ chính thức), sinh bởi scripts/trong-dong-svg.ts -->",
    drumRim(),
    pitch(),
    ...sections,
    "</svg>",
    "",
  ].join("\n");
}

function importSvg(svg: string) {
  const check = svgToDrafts(svg);
  const errors = check.issues.filter((i) => i.level === "error");
  const venue = buildVenue(blockFromSvg(check));
  const seats = venue.sections.reduce(
    (n, sec) => n + sec.rows.reduce((m, r) => m + r.seats.length, 0),
    0,
  );
  return { check, errors, venue, seats };
}

/**
 * Bù phần chênh `CAPACITY - seats` vào row dài nhất của các khu rải đều quanh sân (mỗi khu ±1 ghế,
 * nhiều vòng nếu chênh lớn hơn số khu).
 */
function capacityOverrides(
  venue: ReturnType<typeof importSvg>["venue"],
  seats: number,
): Overrides {
  const delta = CAPACITY - seats;
  const { sections } = venue;
  const per = Math.ceil(Math.abs(delta) / sections.length);
  const touched = Math.ceil(Math.abs(delta) / Math.max(per, 1));
  const stride = sections.length / Math.max(touched, 1);
  return new Map(
    Array.from({ length: touched }, (_, k) => {
      const section = sections[Math.floor(k * stride)];
      // Row dài nhất: row cuối ở khu góc có thể chỉ còn 1 ghế, override về 0 bị bỏ qua
      const longest = section.rows.reduce((a, b) =>
        b.seats.length > a.seats.length ? b : a,
      );
      const change =
        Math.min(per, Math.abs(delta) - k * per) * Math.sign(delta);
      return [
        section.id,
        `${longest.feature.properties.row}:${longest.seats.length + change}`,
      ] as const;
    }),
  );
}

function main([output = "data/venues/trong-dong.svg"]: readonly string[]) {
  const draft = importSvg(trongDongSvg());
  const svg =
    draft.errors.length > 0
      ? trongDongSvg()
      : trongDongSvg(capacityOverrides(draft.venue, draft.seats));
  writeFileSync(output, svg);
  const { check, errors, seats } = importSvg(svg);
  console.log(
    [
      `Đã ghi ${output}`,
      `Nhập thử: ${check.drafts.length} khu, ${errors.length} lỗi, ${seats.toLocaleString("vi-VN")} ghế (sức chứa ${CAPACITY.toLocaleString("vi-VN")})`,
      ...errors.slice(0, 10).map((e) => `  ${e.message}`),
    ].join("\n"),
  );
  if (errors.length > 0 || seats !== CAPACITY) process.exit(1);
}

main(process.argv.slice(2));
