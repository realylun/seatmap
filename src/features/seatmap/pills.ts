// Viên giá kiểu SeatGeek (port seatmap-demo/pills.js): nền trắng bo tròn + chấm màu tier bên trái.
// Vẽ canvas rồi addImage dạng ảnh co giãn (stretchX/content) → icon-text-fit ôm vừa chữ.
import type { Map as MapLibreMap } from "maplibre-gl";
import { colorKey } from "./markers";

const RATIO = 2; // vẽ gấp đôi cho màn hình retina
const H = 30;
const W = 52;
const RADIUS = 15;
const DOT = { x: 15, y: 15, r: 5 };
const CONTENT = { left: 27, right: 41 }; // vùng chữ nằm bên phải chấm màu
const s = (v: number) => v * RATIO;

function drawPill(color: string): ImageData | null {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: W * RATIO,
    height: H * RATIO,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(RATIO, RATIO);
  ctx.beginPath();
  ctx.roundRect(1, 1, W - 2, H - 2, RADIUS - 1);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#dcdde3";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(DOT.x, DOT.y, DOT.r + 2.5, 0, Math.PI * 2);
  ctx.globalAlpha = 0.25; // vòng nhạt quanh chấm
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(DOT.x, DOT.y, DOT.r, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Thêm ảnh "pill-<colorKey>" cho mỗi màu tier chưa có */
export function addPillImages(map: MapLibreMap, colors: readonly string[]) {
  for (const color of colors) {
    const name = `pill-${colorKey(color)}`;
    if (map.hasImage(name)) continue;
    const image = drawPill(color);
    if (!image) continue;
    map.addImage(name, image, {
      pixelRatio: RATIO,
      stretchX: [[s(CONTENT.left + 2), s(CONTENT.right - 2)]],
      stretchY: [[s(RADIUS - 1), s(RADIUS + 1)]],
      content: [s(CONTENT.left), s(6), s(CONTENT.right), s(H - 6)],
    });
  }
}
