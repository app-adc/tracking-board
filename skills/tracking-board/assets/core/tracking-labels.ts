//----------------------   ป้าย/สี/ตัวแปลงค่า ของหน้าติดตามงาน   --------------------------//
// ⚠️ ทุกจุดที่โชว์สถานะ/ประเภท/ความสำคัญของหน้าติดตามงาน ต้องเรียกจากไฟล์นี้เท่านั้น
//    (การ์ดตัวเลข · ตัวกรอง · แถวรายการ · กล่องรายละเอียด · CSV) — กันคำไม่ตรงกันคนละจุด

// แก้ไข (แพ็กเป็นสกิล): เดิม import type เหล่านี้จาก UI kit ของโปรเจกต์ต้นทาง — ประกาศเองให้ไม่ผูกโปรเจกต์
//   ถ้าโปรเจกต์ปลายทางมี type ชื่อเดียวกันอยู่แล้ว เปลี่ยนเป็น import ของโปรเจกต์นั้นได้

/** โทนสีสื่อความหมาย (ป้าย · ตัวเลข · แถบ) — แมปเป็นสีของ UI kit ปลายทาง */
export type Tone = 'primary' | 'ok' | 'warn' | 'danger' | 'neutral'

/** ตัวเลือก 1 รายการของ dropdown */
export type SelectOption<T = string> = { value: T; label: string; disabled?: boolean }

/** 1 แถวในแถบอธิบายสถานะ */
export type StatusLegendItem = { key: string; label: string; tone: Tone; hint: string }

import type { TrackingPriority, TrackingStatus, TrackingType } from './tracking-types'

/** คำบนป้ายสถานะ — คำเดียวกับตัวเลือก dropdown ในชีต (Apps Script ตั้งให้ตอน setup) */
export const TRACKING_STATUS_LABEL: Record<TrackingStatus, string> = {
    waiting_client: 'รอตอบ',
    waiting_team: 'รอทีมเรา',
    in_progress: 'กำลังทำ',
    done: 'เสร็จแล้ว',
    on_hold: 'พักไว้',
    unknown: 'ไม่ทราบสถานะ',
}

export const TRACKING_STATUS_TONE: Record<TrackingStatus, Tone> = {
    waiting_client: 'warn',
    waiting_team: 'primary',
    in_progress: 'primary',
    done: 'ok',
    on_hold: 'neutral',
    unknown: 'neutral',
}

/** ลำดับสถานะตอนเรียง/โชว์แท็บ — เรื่องที่ต้องมีคนลงมือขึ้นก่อน */
export const TRACKING_STATUS_ORDER: TrackingStatus[] = [
    'waiting_client',
    'waiting_team',
    'in_progress',
    'on_hold',
    'done',
    'unknown',
]

/** คำอธิบายสถานะ (แถบ StatusLegend) */
export const TRACKING_STATUS_LEGEND: StatusLegendItem[] = [
    { key: 'waiting_client', label: TRACKING_STATUS_LABEL.waiting_client, tone: 'warn', hint: 'ถามแล้ว รอคำตอบหรือการตัดสินใจ · งานที่ติดเรื่องนี้ยังเดินต่อไม่ได้' },
    { key: 'waiting_team', label: TRACKING_STATUS_LABEL.waiting_team, tone: 'primary', hint: 'ลูกค้าตอบหรือขอมาแล้ว รอทีมเราตรวจ/สรุป/ประเมิน' },
    { key: 'in_progress', label: TRACKING_STATUS_LABEL.in_progress, tone: 'primary', hint: 'เคาะแล้ว ทีมกำลังทำ' },
    { key: 'on_hold', label: TRACKING_STATUS_LABEL.on_hold, tone: 'neutral', hint: 'ตกลงกันว่ายังไม่ทำตอนนี้ · ไม่นับในความคืบหน้า' },
    { key: 'done', label: TRACKING_STATUS_LABEL.done, tone: 'ok', hint: 'ได้คำตอบหรือทำเสร็จแล้ว' },
]

export const TRACKING_TYPE_LABEL: Record<TrackingType | 'unknown', string> = {
    question: 'คำถาม',
    requirement: 'requirement',
    request: 'ขอเพิ่ม',
    bug: 'แจ้งปัญหา',
    decision: 'ข้อตกลง',
    unknown: 'อื่นๆ',
}

export const TRACKING_PRIORITY_LABEL: Record<TrackingPriority, string> = {
    high: 'สำคัญสูง',
    medium: 'สำคัญกลาง',
    low: 'สำคัญต่ำ',
    none: '—',
}

export const TRACKING_PRIORITY_TONE: Record<TrackingPriority, Tone> = {
    high: 'danger',
    medium: 'warn',
    low: 'neutral',
    none: 'neutral',
}

/** ค่าที่รับได้ในชีตของความสำคัญ (นอกจากคีย์อังกฤษ) */
const PRIORITY_ALIASES: Record<string, TrackingPriority> = {
    สูง: 'high',
    กลาง: 'medium',
    ต่ำ: 'low',
}

/**
 * หาคีย์จากค่าที่พิมพ์ในชีต — รับได้ทั้งคีย์อังกฤษ (`done`) และคำไทยบนป้าย (`เสร็จแล้ว`)
 * @param raw ค่าดิบจากชีต
 * @param labels ตารางคีย์ → คำไทย
 * @returns คีย์ที่ตรง หรือ null ถ้าไม่ตรงอะไรเลย
 */
function matchKey<K extends string>(raw: string, labels: Record<K, string>): K | null {
    const value = raw.trim().toLowerCase()
    if (!value) return null

    // เทียบทั้งคีย์และคำไทย แบบไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่างหัวท้าย
    for (const key of Object.keys(labels) as K[]) {
        if (key.toLowerCase() === value || labels[key].toLowerCase() === value) return key
    }
    return null
}

/** แปลงค่าสถานะจากชีต — อ่านไม่ออกได้ `unknown` (ไม่ throw) */
export function parseTrackingStatus(raw: string): TrackingStatus {
    return STATUS_ALIASES[raw.trim()] ?? matchKey(raw, TRACKING_STATUS_LABEL) ?? 'unknown'
}

/**
 * คำเก่าของสถานะที่ยังรับอยู่
 * @description แก้ไข (9 ต.ค. — ผู้ใช้สั่ง): เปลี่ยนป้าย "รอลูกค้าตอบ" → "รอตอบ" · แถวในชีตที่พิมพ์คำเก่าไว้ยังอ่านออก
 */
const STATUS_ALIASES: Record<string, TrackingStatus> = {
    รอลูกค้าตอบ: 'waiting_client',
}

/** แปลงค่าประเภทจากชีต — อ่านไม่ออกได้ `unknown` */
export function parseTrackingType(raw: string): TrackingType | 'unknown' {
    return matchKey(raw, TRACKING_TYPE_LABEL) ?? 'unknown'
}

/** แปลงค่าความสำคัญจากชีต — รับ `สูง/กลาง/ต่ำ` · `สำคัญสูง` · `high` · ว่าง/อ่านไม่ออกได้ `none` */
export function parseTrackingPriority(raw: string): TrackingPriority {
    const value = raw.trim()
    return PRIORITY_ALIASES[value] ?? matchKey(value, TRACKING_PRIORITY_LABEL) ?? 'none'
}

/** เรื่องที่ "ยังค้าง" (แท็บ "ยังค้าง") — พักไว้/เสร็จแล้ว ไม่นับ */
export function isTrackingOpen(status: TrackingStatus): boolean {
    return status !== 'done' && status !== 'on_hold'
}

/** เรื่องที่รอคำตอบอยู่ (รอลูกค้า/รอทีมเรา) — มีแค่กลุ่มนี้ที่ขึ้นป้าย "ค้าง N วัน" */
export function isTrackingWaiting(status: TrackingStatus): boolean {
    return status === 'waiting_client' || status === 'waiting_team'
}

/**
 * นับว่าเรื่องรอคำตอบมากี่วัน (นับจากวันที่ถามถึงวันนี้)
 * @param askedAt วันที่ถาม (ISO)
 * @param status สถานะ — ไม่ได้รอคำตอบ (กำลังทำ/เสร็จ/พักไว้) ได้ null
 * @returns จำนวนวันเต็ม · null ถ้าไม่ได้รอคำตอบหรือไม่มีวันที่ถาม
 *
 * @description แก้ไข: เดิมนับทุกสถานะที่ยังไม่เสร็จ → เรื่องที่ "กำลังทำ" ขึ้นแดงว่าค้าง ทั้งที่ได้คำตอบแล้ว
 */
export function trackingOpenDays(askedAt: string, status: TrackingStatus): number | null {
    if (!askedAt || !isTrackingWaiting(status)) return null
    const days = Math.floor((Date.now() - new Date(askedAt).getTime()) / 86_400_000)
    return Number.isNaN(days) ? null : Math.max(days, 0)
}

/** ค้างนานเท่าไรถึงขึ้นสีแดง — เกิน 1 สัปดาห์ถือว่าต้องตามแล้ว */
export const TRACKING_STALE_DAYS = 7

/**
 * คอลัมน์ของบอร์ด (ซ้าย → ขวา) = สถานะที่ตั้งได้จากหน้าเว็บ
 * @description เรียงตามทางเดินของเรื่อง: ถาม → รอตอบ → ทำ → เสร็จ · พักไว้อยู่ท้ายสุด
 *              (`unknown` ไม่ใช่คอลัมน์ปกติ — โผล่เป็นคอลัมน์พิเศษเฉพาะตอนมีค่าพิมพ์ผิดในชีต)
 */
export const TRACKING_BOARD_STATUSES: Exclude<TrackingStatus, 'unknown'>[] = [
    'waiting_client',
    'waiting_team',
    'in_progress',
    'done',
    'on_hold',
]

/** ตัวเลือกประเภทในฟอร์ม */
export const TRACKING_TYPE_OPTIONS: SelectOption<TrackingType>[] = (
    ['question', 'requirement', 'request', 'bug', 'decision'] as const
).map((value) => ({ value, label: TRACKING_TYPE_LABEL[value] }))

/** ตัวเลือกสถานะในฟอร์ม/ตัวย้ายสถานะ */
export const TRACKING_STATUS_OPTIONS: SelectOption<Exclude<TrackingStatus, 'unknown'>>[] =
    TRACKING_BOARD_STATUSES.map((value) => ({ value, label: TRACKING_STATUS_LABEL[value] }))

/** ตัวเลือกความสำคัญในฟอร์ม (`none` = ไม่ระบุ) */
export const TRACKING_PRIORITY_OPTIONS: SelectOption<TrackingPriority>[] = (
    ['high', 'medium', 'low', 'none'] as const
).map((value) => ({ value, label: value === 'none' ? 'ไม่ระบุ' : TRACKING_PRIORITY_LABEL[value] }))

/** ใกล้ถึงกำหนดภายในกี่วันถึงขึ้นสีส้มเตือน */
export const TRACKING_DUE_SOON_DAYS = 2

/**
 * สถานะกำหนดเสร็จของเรื่อง
 * @param dueAt กำหนดเสร็จ (ISO) — ว่าง = ไม่กำหนด
 * @param status สถานะเรื่อง — เสร็จแล้ว/พักไว้ ไม่นับว่าเลยกำหนด
 * @returns null ถ้าไม่กำหนด · `daysLeft` = เหลือกี่วัน (ติดลบ = เลยมาแล้ว) · `tone` ไว้ลงสีป้าย
 *
 * @description นับเป็นวันตามปฏิทิน (ตัดเวลาทิ้ง) — กำหนดวันนี้ = เหลือ 0 วัน ยังไม่นับว่าเลย
 */
export function trackingDueState(
    dueAt: string,
    status: TrackingStatus
): { daysLeft: number; tone: Tone; label: string } | null {
    if (!dueAt) return null
    const due = new Date(dueAt)
    if (Number.isNaN(due.getTime())) return null

    const today = new Date()
    const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const daysLeft = Math.round((startOf(due) - startOf(today)) / 86_400_000)

    // เสร็จ/พักไว้แล้ว → แค่บอกวันกำหนด ไม่เตือน
    if (!isTrackingOpen(status)) return { daysLeft, tone: 'neutral', label: '' }
    if (daysLeft < 0) return { daysLeft, tone: 'danger', label: `เลยกำหนด ${-daysLeft} วัน` }
    if (daysLeft === 0) return { daysLeft, tone: 'warn', label: 'ครบกำหนดวันนี้' }
    if (daysLeft <= TRACKING_DUE_SOON_DAYS) return { daysLeft, tone: 'warn', label: `อีก ${daysLeft} วัน` }
    return { daysLeft, tone: 'neutral', label: '' }
}
