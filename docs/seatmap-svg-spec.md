# Quy chuẩn SVG sơ đồ ghế (cho designer)

Editor template (`/admin/templates/<id>/edit`, nút **Nhập SVG**) đọc file SVG theo quy chuẩn dưới đây
và dựng venue: polygon khu, hàng, từng ghế. Ảnh PNG chỉ dùng để vẽ đè (trace), **không** phải nguồn dữ
liệu. Nguồn của quy chuẩn: `.omc/research/seatmap-vector-format.md`.

Code đọc file: `src/domain/venue/svg/` (`svgToDrafts`). File mẫu chạy được:
`src/domain/venue/svg/fixtures/s311.svg`.

## 1. Cấu trúc

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 1150">
  <!-- Sân / sân khấu: dùng để quay row A về phía sân -->
  <polygon id="field" points="1500,1150 1600,950 2000,700 2000,1150"/>

  <!-- 1 khu = 1 group -->
  <g data-section="311">
    <path data-role="outline" d="M101 950 H162 V887 ... Z"/>
    <g data-row="A">
      <circle data-seat="1" cx="131" cy="1059" r="11"/>
      <circle data-seat="2" cx="131" cy="1027" r="11"/>
    </g>
    <g data-row="B"> … </g>
    <text data-role="label" x="920" y="580">311</text>
  </g>
</svg>
```

| Thành phần | Cách đánh dấu | Hình hợp lệ |
|---|---|---|
| Khu | `<g data-section="311">` | Group chứa outline + các row |
| Outline khu | `data-role="outline"` (bắt buộc nếu trong khu có hình trang trí khác) | `path` chỉ gồm **M/L/H/V/Z**, `polygon`, `rect` — khép kín, 1 subpath |
| Row | `<g data-row="A">` bên trong khu | Tên row duy nhất trong khu (không phân biệt hoa thường) |
| Ghế | `data-seat="12"` bên trong row | `circle` (khuyên dùng), `ellipse` tròn, hoặc `rect`; số nguyên dương, không trùng trong row |
| Sân / sân khấu | `id="field"` / `id="stage"` (đặt lên hình hoặc group chứa các hình) | `path`/`polygon`/`rect`/`circle`/`ellipse`; hình không đọc được chỉ bị bỏ qua kèm cảnh báo |
| Nhãn | `data-role="label"` | Bị bỏ qua (tên khu lấy từ `data-section`) |

Thuộc tính `data-*` đặt ở group cha được truyền xuống con — ví dụ có thể đặt `data-row` lên từng
`circle` thay cho group row.

### Figma / Illustrator (không xuất `data-*`)

Đặt **tên layer** theo cây dưới đây; khi export với id, editor tự suy ra:

```
sec-311            ← group khu
├── outline        ← outline khu
├── row-A          ← group row
│   ├── seat-1
│   └── seat-2
└── label
field              ← sân
```

Hậu tố chống trùng tên do công cụ tự thêm (`row-A_2`, `seat-12_3_`) được bỏ qua — vì vậy **đừng
đặt tên khu kết thúc bằng `_<số>`** (`sec-A_1` sẽ thành khu `A`). Tên khu có thể chứa gạch nối
(`sec-C-101` → khu `C-101`). Hình nằm trong row nhưng không có số ghế (vd. `Ellipse 12`) là **lỗi**,
không bị bỏ qua lặng lẽ.

## 2. Tham số tuỳ chọn trên khu

Dùng khi khu **không vẽ ghế** — editor sẽ sinh ghế tự động (row song song cạnh trước):

| Thuộc tính | Ý nghĩa | Mặc định |
|---|---|---|
| `data-rows` | Số row (0…200) | Ước lượng theo độ sâu khu |
| `data-row-start` | Row đầu (`A` hoặc `1`) | `A` |
| `data-row-skip` | Bỏ qua row, vd. `I,O` | `I,O` |
| `data-seats-per-row` | Ghế mỗi row (`0` = tự tính, tối đa 500) | `0` |
| `data-seat-spacing` | Khoảng cách ghế (đơn vị map) | `0.25` |
| `data-numbering` | `ltr` / `rtl` | `ltr` |
| `data-front-edge` | Chỉ số cạnh trước (row A), đếm từ 0 tại điểm đầu của outline **sau khi bỏ điểm trùng / thẳng hàng** | Cạnh quay về sân |
| `data-overrides` | Ghi đè số ghế, vd. `A:12,B:14` | — |

Khu đã vẽ ghế thì các tham số trên không dùng để sinh ghế (số row = số group row), nhưng nếu có
khai báo thì vẫn phải hợp lệ.

## 3. Checklist trước khi giao file

1. Một artboard, **viewBox cố định** cho cả venue; không đổi tỉ lệ giữa các lần giao.
2. **Không nhúng ảnh raster** (`<image>`) — bị bỏ qua và báo cảnh báo.
3. Outline khu là đường thẳng / bậc thang khép kín. **Không dùng curve** (C/S/Q/T/A) — bị từ chối.
4. Mỗi khu đúng **1 outline**; khu trùng id sẽ báo "có 2 outline".
5. Ghế là `circle` cùng bán kính, tâm đúng vị trí thật, **nằm trong outline** (cho phép chạm mép
   trong phạm vi bán kính).
6. Số ghế là số nguyên, không trùng trong row; row không trùng tên trong khu.
7. Text giữ là text (không outline hoá); nhãn không ảnh hưởng dữ liệu.
8. Có `field` (sân/sân khấu) để row A quay về phía sân; thiếu thì editor báo cảnh báo.
9. **Expand / ungroup** symbol trước khi export — `<use>` không được hỗ trợ.
10. Quy ước đánh số thống nhất toàn venue (vd. row A gần sân nhất, ghế 1 bên trái khi nhìn từ sân).

Transform lồng nhau (`translate`, `scale`, `rotate`, `matrix`, `skewX/Y`) được hỗ trợ, nhưng
flatten trước khi export vẫn giúp file gọn và dễ kiểm tra.

## 4. Export

- **Illustrator**: File → Export → Export As → SVG. Styling: *Presentation Attributes*; Object IDs:
  *Layer Names*; bỏ chọn *Minify*; Font: *SVG* (giữ text). Chuyển ellipse dẹt thành circle.
- **Figma**: chọn frame → Export → SVG, bật **Include "id" attribute**; tắt *Outline text*.
- Kiểm tra: mở file bằng trình soạn thảo text — phải thấy `data-section` hoặc `id="sec-…"`.

## 5. Sau khi nhập

- Lỗi (đỏ) chặn việc nhập; cảnh báo (vàng) không chặn. Danh sách hiện ở panel phải, ghi rõ khu /
  ghế để sửa file một lượt.
- Khu có ghế từ SVG chỉ cho đổi tên trong editor. Muốn đổi vị trí ghế: sửa SVG rồi nhập lại; hoặc
  bấm **Chuyển sang sinh tự động** để bỏ ghế đặt tay.
- SVG được raster hoá thành PNG (cạnh dài 4096 px) và lưu làm ảnh nền của template.
- Draft tự lưu tối đa ~3.8 MB. Venue rất lớn (hàng chục nghìn ghế) có thể vượt — khi đó editor báo
  và cần **Xuất venue.json** để giữ bản làm việc.
