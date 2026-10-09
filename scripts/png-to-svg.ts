import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { rasterToSvg } from "../src/domain/venue/svg/raster-to-svg";
import { svgToDrafts } from "../src/domain/venue/svg/svg-venue";

function imageSize(file: string) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [width, height] = out.split("x").map(Number);
  if (!(width > 0 && height > 0))
    throw new Error(`Không đọc được kích thước ảnh: "${out}"`);
  return { width, height };
}

function decodeRgba(file: string) {
  const { width, height } = imageSize(file);
  const data = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: width * height * 4 + 1024 },
  );
  if (data.length !== width * height * 4)
    throw new Error(
      `ffmpeg trả về ${data.length} byte, cần ${width * height * 4}`,
    );
  return { width, height, data };
}

function main([input, output, spacing]: readonly string[]) {
  const seatSpacing = spacing === undefined ? undefined : Number(spacing);
  if (!input || !output || (seatSpacing !== undefined && !(seatSpacing > 0))) {
    console.error(
      "Cách dùng: pnpm svg:from-png <input.png> <output.svg> [seat-spacing>0]",
    );
    process.exit(2);
  }
  const result = rasterToSvg(decodeRgba(input), { seatSpacing });
  writeFileSync(output, result.svg);
  const check = svgToDrafts(result.svg);
  const errors = check.issues.filter((i) => i.level === "error");
  const warnings = check.issues.filter((i) => i.level === "warning");
  console.log(
    [
      `Đã ghi ${output}`,
      `Màu khu: rgb(${result.sectionColor.join(",")})`,
      `Khu: ${result.sections}, sân khấu: ${result.stages}`,
      `Loại: ${result.dropped.color} khác màu, ${result.dropped.solidity} hình mảnh/X, ${result.dropped.insideStage} trong sân khấu`,
      `Nhập thử: ${check.drafts.length} khu, ${errors.length} lỗi, ${warnings.length} cảnh báo`,
      ...[
        ...new Set(
          check.issues.map((i) => i.message.replace(/^Khu \S+ /, "Khu … ")),
        ),
      ]
        .slice(0, 20)
        .map((m) => `  ${m}`),
    ].join("\n"),
  );
  if (errors.length > 0) process.exit(1);
}

main(process.argv.slice(2));
