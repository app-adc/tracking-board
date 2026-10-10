# ตัวอย่างที่ใช้งานจริง — Vue 3 + TypeScript + Tailwind v4 (โปรเจกต์ ATR)

โค้ดชุดนี้ทำงานจริงบน production (9 ต.ค. 2026) — ใช้**อ่านเทียบ**ตอนสร้างหน้าตาม `../ui-spec.md`

| ไฟล์ | หน้าที่ |
| --- | --- |
| `tracking-route.ts` | route `/tracking` สาธารณะ ไม่มี guard |
| `Index.vue` | หน้า: โหลด · การ์ดตัวเลข · ตัวกรอง · สลับมุมมอง · ย้ายสถานะแบบ optimistic · ซ่อน · `?item=` |
| `components/TrackingBoard.vue` | บอร์ด + HTML5 drag & drop |
| `components/TrackingItemCard.vue` | การ์ดเรื่อง (`div[role=button]` ลากได้ · โหมด compact) |
| `components/TrackingItemModal.vue` | กล่องรายละเอียด + คอมเมนต์ (ชื่อพิมพ์เอง) |
| `components/TrackingItemFormModal.vue` | ฟอร์มสร้าง/แก้ (ชื่อผู้บันทึก · กำหนดเสร็จ) |

## สิ่งที่ผูกกับ ATR — ต้องเปลี่ยนเป็นของโปรเจกต์ปลายทาง

- `@/components/ui` — UI kit ของ ATR: `UiAlert` `UiBadge` `UiButton` `UiCard` `UiConfirm` `UiDatePicker` `UiEmpty` `UiInput`
  `UiModal` (prop `dismissible`) `UiProgress` `UiSelect` (prop `clearable`) `UiSkeleton` `UiStat` `UiTabs` `UiTextarea`
- `@/components/shared/StatusLegend.vue` — แถบอธิบายสถานะ (ป้าย + คำอธิบาย)
- `@/composables/use-toast` — `toast.success / error(message, { duration: 0 })`
- `@/lib/format-date` — `toThaiDate(iso, withYear?)` · `toThaiDateTime(iso, withYear?)` (ต่อท้าย "น.")
- `@/lib/tracking/*` — คือโค้ดแกนใน `assets/core/` ของสกิล
- `@/types/router` — `EnumRouter.tracking` (ชื่อ route)
- token สี Tailwind: `primary` `ok` `warn` `danger` + `*-soft` · `ink` `muted` `faint` · `line` `ground` `panel` · `rounded-card` `rounded-control` · ขนาดตัวอักษร `text-tiny/small/body/lead`
- ไอคอน `lucide-vue-next`

ถ้าโปรเจกต์ปลายทางเป็น Vue 3 + Tailwind ด้วย → ก๊อปไปแล้วแทน import ข้างบนเป็นของโปรเจกต์ (เร็วสุด)
เฟรมเวิร์กอื่น → เขียนใหม่ตาม `ui-spec.md` ใช้ไฟล์นี้ดูแค่ logic ที่ยาก (drag & drop · optimistic move · `?item=` · ตัวกรองร่วม)
