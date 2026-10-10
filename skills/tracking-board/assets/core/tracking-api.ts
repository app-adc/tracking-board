//----------------------   ต่อ Google Sheets ผ่าน Apps Script   --------------------------//
// หน้าเว็บคุยกับ Apps Script Web App (โค้ดอยู่ที่ assets/Code.gs ของสกิล tracking-board) ไม่ใช่ backend ของแอป
//
// @description
// - อ่าน: GET `?action=list` → items (เฉพาะแถวที่ติ๊ก publish) + comments
// - อ่าน: GET `?action=list` → items (เฉพาะแถวที่ติ๊ก publish) + comments
// - เขียน: POST `comment` · `createItem` · `updateItem` · `archiveItem`
//   ส่งเป็น `text/plain` ตั้งใจ — Apps Script ตอบ preflight (OPTIONS) ไม่ได้
//   ถ้าส่ง `application/json` เบราว์เซอร์จะยิง preflight ก่อนแล้วโดน CORS ตีกลับ
// - ไม่มีล็อกอิน (ผู้ใช้เคาะ 9 ต.ค. — ลองล็อกอิน Google แล้วถอยกลับ ไม่อยากตั้งค่า Console ของบริษัท)
//   **คอมเมนต์ · สร้าง · แก้ (ผ่านฟอร์ม) ต้องพิมพ์ชื่อเองทุกครั้ง** · ลากย้ายสถานะ/ซ่อน ไม่ระบุชื่อ
// - แก้เรื่อง: ส่ง `baseUpdatedAt` ไปด้วย ถ้ามีคนแก้ทับไปก่อน สคริปต์ปฏิเสธ (กันข้อมูลหายเงียบ)
// - ไม่ได้ตั้ง URL: โหมด dev ใช้ข้อมูลตัวอย่างในหน่วยความจำ · `--mode prod` แจ้งว่ายังไม่ได้ตั้งค่า
//
// แก้ไข (9 ต.ค.): เดิมเขียนได้แค่คอมเมนต์ — ผู้ใช้ให้เป็นบอร์ดแบบ Trello สร้าง/แก้/ย้าย/ซ่อนเรื่องได้

import { TRACKING_API_URL, TRACKING_ID, TRACKING_IS_PRODUCTION } from './tracking-config'
import {
    parseTrackingPriority,
    parseTrackingStatus,
    parseTrackingType,
    TRACKING_STATUS_LABEL,
} from './tracking-labels'
import type {
    TrackingComment,
    TrackingCommentPayload,
    TrackingData,
    TrackingItem,
    TrackingItemInput,
    TrackingItemSaveResult,
    TrackingSource,
} from './tracking-types'

/** URL ของ Apps Script Web App — ตั้งใน tracking-config.ts (ไฟล์เดียวที่ผูกเฟรมเวิร์ก) */
const API_URL = TRACKING_API_URL

/**
 * ความยาวสูงสุดของแต่ละช่อง
 * ⚠️ ต้องตรงกับ `LIMITS` ใน Code.gs (ฝั่งนั้นตรวจซ้ำอีกชั้น)
 */
export const TRACKING_LIMITS = {
    author: 60,
    message: 2000,
    title: 200,
    detail: 5000,
    answer: 5000,
    module: 40,
    release: 40,
    blocks: 500,
    link: 500,
} as const

/** คีย์จำข้อมูลชุดล่าสุดไว้ในเครื่อง — โหลดไม่ได้ (เน็ตหลุด/สคริปต์ล่ม) ยังเปิดดูของเดิมได้ */
const CACHE_KEY = `${TRACKING_ID}-cache`

/** รอ Apps Script นานสุดเท่าไร — ตอนสคริปต์ตื่นจากหลับครั้งแรกอาจช้า 3–5 วินาที */
const TIMEOUT_MS = 20_000

/**
 * โหมดการทำงานตอนนี้
 * @returns `live` = ต่อชีตจริง · `mock` = ข้อมูลตัวอย่าง · `unconfigured` = prod แต่ยังไม่ตั้ง URL
 */
export function getTrackingMode(): 'live' | 'mock' | 'unconfigured' {
    if (API_URL) return 'live'
    return TRACKING_IS_PRODUCTION ? 'unconfigured' : 'mock'
}

/*------------------------------ แปลงค่าจากชีต ---------------------------------*/

/** แปลงค่าอะไรก็ได้จากชีตเป็นข้อความ (ตัวเลข/ค่าว่าง/null) */
function toText(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
}

/** รับเฉพาะวันที่ที่อ่านออก — ไม่ใช่ได้ค่าว่าง (หน้าจอโชว์ขีด) */
function toIsoDate(value: unknown): string {
    const text = toText(value)
    if (!text) return ''
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/** รับเฉพาะลิงก์ http(s) — กันคนพิมพ์ `javascript:` ลงชีตแล้วกลายเป็นลิงก์กดได้ในหน้าเว็บ */
function toSafeLink(value: unknown): string {
    const text = toText(value)
    return /^https?:\/\//i.test(text) ? text : ''
}

/**
 * แปลง 1 แถวจากชีตเป็น TrackingItem
 * @param raw object ที่ Apps Script ส่งมา (คีย์ = หัวคอลัมน์)
 * @returns null ถ้าไม่มีรหัสหรือหัวข้อ (แถวว่าง/กรอกไม่ครบ ข้ามทิ้ง)
 */
function normalizeItem(raw: Record<string, unknown>): TrackingItem | null {
    const id = toText(raw.id)
    const title = toText(raw.title)
    if (!id || !title) return null

    return {
        id,
        title,
        type: parseTrackingType(toText(raw.type)),
        module: toText(raw.module),
        detail: toText(raw.detail),
        status: parseTrackingStatus(toText(raw.status)),
        priority: parseTrackingPriority(toText(raw.priority)),
        askedAt: toIsoDate(raw.askedAt),
        answeredAt: toIsoDate(raw.answeredAt),
        dueAt: toIsoDate(raw.dueAt),
        answer: toText(raw.answer),
        release: toText(raw.release),
        blocks: toText(raw.blocks),
        link: toSafeLink(raw.link),
        createdBy: toText(raw.createdBy),
        createdAt: toIsoDate(raw.createdAt),
        updatedBy: toText(raw.updatedBy),
        // ⚠️ เก็บค่าดิบ ไม่แปลงผ่าน Date — ต้องส่งกลับไปเทียบกับในชีตแบบตรงตัวอักษร
        updatedAt: toText(raw.updatedAt),
    }
}

/** แปลง 1 คอมเมนต์ — ไม่มีรหัสเรื่องหรือข้อความ ข้ามทิ้ง */
function normalizeComment(raw: Record<string, unknown>): TrackingComment | null {
    const itemId = toText(raw.itemId)
    const message = toText(raw.message)
    if (!itemId || !message) return null

    return {
        id: toText(raw.id) || `${itemId}-${toText(raw.createdAt)}`,
        itemId,
        author: toText(raw.author) || 'ไม่ระบุชื่อ',
        message,
        createdAt: toIsoDate(raw.createdAt),
    }
}

/** แปลง array ดิบ — ของที่ไม่ใช่ object หรือแปลงไม่ผ่านถูกข้าม */
function normalizeList<T>(list: unknown, fn: (raw: Record<string, unknown>) => T | null): T[] {
    if (!Array.isArray(list)) return []
    return list
        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        .map(fn)
        .filter((row): row is T => row !== null)
}

/** ดึง object ย่อยจาก body (เช่น `body.item`) — ไม่ใช่ object ได้ object ว่าง */
function pick(body: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = body[key]
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/*------------------------------ เรียก Apps Script ---------------------------------*/

/**
 * ยิง request ไป Apps Script แล้วแกะผลลัพธ์
 * @param init ตัวเลือกของ fetch
 * @param query query string เพิ่มเติม
 * @returns body ที่ `ok: true`
 * @throws Error ข้อความไทยพร้อมโชว์ผู้ใช้
 */
async function callScript(init: RequestInit, query = ''): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        // Apps Script ตอบ 302 ไป googleusercontent.com — fetch ตาม redirect ให้เอง
        const res = await fetch(`${API_URL}${query}`, { ...init, signal: controller.signal })
        if (!res.ok) throw new Error(`เชื่อมต่อ Google Sheets ไม่ได้ (HTTP ${res.status})`)

        const body: unknown = await res.json().catch(() => null)
        if (typeof body !== 'object' || body === null) {
            throw new Error('ข้อมูลจาก Google Sheets อ่านไม่ออก — ตรวจว่า Deploy สคริปต์ถูกต้อง')
        }

        const result = body as Record<string, unknown>
        if (result.ok !== true) {
            throw new Error(toText(result.error) || 'Google Sheets ปฏิเสธคำขอ')
        }
        return result
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Google Sheets ตอบช้าเกินไป ลองใหม่อีกครั้ง')
        }
        if (error instanceof TypeError) {
            // fetch โยน TypeError ตอนเน็ตหลุด/CORS — ไม่มีรายละเอียดให้ผู้ใช้อ่านรู้เรื่อง
            throw new Error('เชื่อมต่อ Google Sheets ไม่ได้ — ตรวจอินเทอร์เน็ต')
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}

/** POST คำสั่งเขียน — รวมไว้จุดเดียวให้ทุกคำสั่งส่งแบบ text/plain เหมือนกัน */
function postScript(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callScript({
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
    })
}

/** เขียนข้อมูลชุดล่าสุดลงเครื่อง — พื้นที่เต็ม/โหมดส่วนตัวก็แค่ไม่จำ ไม่ทำให้หน้าพัง */
function saveCache(data: TrackingData) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
        // ไม่จำก็ได้ ไม่ต้องแจ้งผู้ใช้
    }
}

/** อ่านข้อมูลชุดล่าสุดที่จำไว้ — ไม่มี/อ่านไม่ออกได้ null */
function readCache(): TrackingData | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<TrackingData>
        return {
            items: normalizeList(parsed.items, normalizeItem),
            comments: normalizeList(parsed.comments, normalizeComment),
            fetchedAt: toIsoDate(parsed.fetchedAt),
        }
    } catch {
        return null
    }
}

/*------------------------------ โหมดข้อมูลตัวอย่าง ---------------------------------*/

/** ข้อมูลตัวอย่างที่แก้ได้ — อยู่แค่ในหน่วยความจำ รีเฟรชแล้วหาย (null = ยังไม่ได้โหลด) */
let mockState: { items: TrackingItem[]; comments: TrackingComment[] } | null = null

/**
 * โหลดข้อมูลตัวอย่างแบบ dynamic import
 * @description ไม่ import ตรงๆ ด้านบน — ข้อมูลตัวอย่างจะได้ไม่ถูกโหลดใน prod/โหมดต่อชีตจริง
 */
async function loadMock() {
    if (!mockState) {
        const mock = await import('./tracking-mock')
        mockState = {
            items: mock.MOCK_TRACKING_ITEMS.map((item) => ({ ...item })),
            comments: [...mock.MOCK_TRACKING_COMMENTS],
        }
    }
    return mockState
}

/** รหัสเรื่องถัดไป `T-###` — ใช้ในโหมดตัวอย่าง (โหมดจริงสคริปต์ออกรหัสให้) */
function nextMockId(items: TrackingItem[]): string {
    const max = items.reduce((top, item) => {
        const num = Number(/^T-(\d+)$/.exec(item.id)?.[1] ?? 0)
        return Math.max(top, num)
    }, 0)
    return `T-${String(max + 1).padStart(3, '0')}`
}

/** แปลงวันที่ `yyyy-mm-dd` เป็น ISO แบบเดียวกับที่อ่านจากชีต (ว่างได้ว่าง) */
function inputDateToIso(value: string): string {
    return value ? new Date(`${value}T00:00:00`).toISOString() : ''
}

/** ช่องของ TrackingItem ที่มาจาก input (ใช้ร่วมทั้งสร้างและแก้ในโหมดตัวอย่าง) */
function applyInput(item: TrackingItem, input: Partial<TrackingItemInput>): TrackingItem {
    return {
        ...item,
        ...input,
        askedAt: input.askedAt !== undefined ? inputDateToIso(input.askedAt) : item.askedAt,
        answeredAt: input.answeredAt !== undefined ? inputDateToIso(input.answeredAt) : item.answeredAt,
        dueAt: input.dueAt !== undefined ? inputDateToIso(input.dueAt) : item.dueAt,
    }
}

/** บันทึกการย้ายสถานะ — ข้อความเดียวกับที่ Code.gs เขียน */
function statusLogMessage(from: TrackingItem['status'], to: TrackingItem['status']): string {
    return `ย้ายสถานะ: ${TRACKING_STATUS_LABEL[from]} → ${TRACKING_STATUS_LABEL[to]}`
}

/*------------------------------ อ่าน ---------------------------------*/

/**
 * โหลดเรื่องทั้งหมด + คอมเมนต์
 * @returns ข้อมูล · ที่มา · ข้อความเตือน (กรณีใช้ข้อมูลที่จำไว้แทน)
 * @throws Error เมื่อโหลดไม่ได้และไม่มีข้อมูลที่จำไว้ หรือ prod ยังไม่ตั้ง URL
 */
export async function fetchTrackingData(): Promise<{
    data: TrackingData
    source: TrackingSource
    warning: string
}> {
    const mode = getTrackingMode()

    if (mode === 'unconfigured') {
        throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Sheets (URL ของ Apps Script)')
    }

    if (mode === 'mock') {
        const mock = await loadMock()
        return {
            data: {
                items: mock.items.map((item) => ({ ...item })),
                comments: mock.comments.map((comment) => ({ ...comment })),
                fetchedAt: new Date().toISOString(),
            },
            source: 'mock',
            warning: '',
        }
    }

    try {
        const body = await callScript({ method: 'GET' }, '?action=list')
        const data: TrackingData = {
            items: normalizeList(body.items, normalizeItem),
            comments: normalizeList(body.comments, normalizeComment),
            fetchedAt: new Date().toISOString(),
        }
        saveCache(data)
        return { data, source: 'live', warning: '' }
    } catch (error) {
        // โหลดสดไม่ได้ → ถอยไปใช้ชุดที่จำไว้ (ถ้ามี) พร้อมบอกว่าเป็นข้อมูลเก่า
        const cached = readCache()
        if (!cached) throw error
        return {
            data: cached,
            source: 'cache',
            warning: error instanceof Error ? error.message : 'โหลดข้อมูลล่าสุดไม่ได้',
        }
    }
}

/*------------------------------ ตรวจข้อมูล ---------------------------------*/

/** ตรวจชื่อผู้คอมเมนต์ — คืนข้อความผิดพลาด หรือค่าว่างถ้าผ่าน */
export function validateTrackingAuthor(author: string): string {
    const name = author.trim()
    if (!name) return 'กรอกชื่อของคุณ'
    if (name.length > TRACKING_LIMITS.author) return `ชื่อยาวได้ไม่เกิน ${TRACKING_LIMITS.author} ตัวอักษร`
    return ''
}

/** ตรวจข้อความคอมเมนต์ (Apps Script ตรวจซ้ำอีกชั้น) — คืนข้อความผิดพลาด หรือค่าว่างถ้าผ่าน */
export function validateTrackingMessage(message: string): string {
    const text = message.trim()
    if (!text) return 'พิมพ์ข้อความก่อนส่ง'
    if (text.length > TRACKING_LIMITS.message) return `ข้อความยาวได้ไม่เกิน ${TRACKING_LIMITS.message} ตัวอักษร`
    return ''
}

export type TrackingItemErrors = Partial<Record<keyof TrackingItemInput, string>>

/**
 * ตรวจฟอร์มสร้าง/แก้เรื่อง (Apps Script ตรวจซ้ำอีกชั้น)
 * @returns ข้อความผิดพลาดรายช่อง — object ว่าง = ผ่าน
 */
export function validateTrackingItem(input: TrackingItemInput): TrackingItemErrors {
    const errors: TrackingItemErrors = {}

    if (!input.title.trim()) errors.title = 'กรอกหัวข้อ'

    // ช่องข้อความที่มีเพดานความยาว
    const limited = ['title', 'detail', 'answer', 'module', 'release', 'blocks', 'link'] as const
    for (const key of limited) {
        if (!errors[key] && input[key].trim().length > TRACKING_LIMITS[key]) {
            errors[key] = `ยาวได้ไม่เกิน ${TRACKING_LIMITS[key]} ตัวอักษร`
        }
    }

    if (input.link.trim() && !/^https?:\/\//i.test(input.link.trim())) {
        errors.link = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    }

    for (const key of ['askedAt', 'answeredAt', 'dueAt'] as const) {
        if (input[key] && !/^\d{4}-\d{2}-\d{2}$/.test(input[key])) errors[key] = 'รูปแบบวันที่ไม่ถูกต้อง'
    }

    return errors
}

/** ตัดช่องว่างหัวท้ายทุกช่องข้อความก่อนส่ง */
function cleanInput<T extends Partial<TrackingItemInput>>(input: T): T {
    const clean = { ...input }
    for (const key of Object.keys(clean) as (keyof T)[]) {
        const value = clean[key]
        if (typeof value === 'string') clean[key] = value.trim() as T[keyof T]
    }
    return clean
}

/*------------------------------ เขียน ---------------------------------*/

/**
 * บันทึกคอมเมนต์ใหม่ลงแท็บ `comments`
 * @param payload รหัสเรื่อง · ชื่อผู้คอมเมนต์ · ข้อความ (ตรวจด้วย validateTrackingAuthor/Message มาแล้ว)
 * @returns คอมเมนต์ที่บันทึกแล้ว (มีรหัสและเวลาจากฝั่งสคริปต์)
 * @throws Error เมื่อบันทึกไม่ได้
 */
export async function postTrackingComment(payload: TrackingCommentPayload): Promise<TrackingComment> {
    const clean: TrackingCommentPayload = {
        itemId: payload.itemId.trim(),
        author: payload.author.trim(),
        message: payload.message.trim(),
    }

    if (getTrackingMode() !== 'live') {
        // โหมดตัวอย่าง — จำไว้ในหน่วยความจำให้เห็นผลเหมือนบันทึกจริง
        const { comments } = await loadMock()
        const comment: TrackingComment = {
            ...clean,
            id: `C-mock-${comments.length + 1}`,
            createdAt: new Date().toISOString(),
        }
        comments.push(comment)
        return comment
    }

    const body = await postScript({ action: 'comment', ...clean })
    const comment = normalizeComment(pick(body, 'comment'))
    if (!comment) throw new Error('บันทึกแล้วแต่อ่านผลไม่ออก — กดรีเฟรชเพื่อดูคอมเมนต์ล่าสุด')
    return comment
}

/**
 * สร้างเรื่องใหม่ (เผยแพร่ทันที)
 * @param input ข้อมูลเรื่อง (ตรวจด้วย validateTrackingItem มาแล้ว)
 * @param author ชื่อผู้สร้าง (พิมพ์เองในฟอร์ม · ตรวจด้วย validateTrackingAuthor มาแล้ว)
 * @returns เรื่องที่สร้างแล้ว — รหัส `T-###` ออกโดยสคริปต์
 * @throws Error เมื่อบันทึกไม่ได้
 */
export async function createTrackingItem(
    input: TrackingItemInput,
    author: string
): Promise<TrackingItemSaveResult> {
    const clean = cleanInput(input)
    const name = author.trim()

    if (getTrackingMode() !== 'live') {
        const mock = await loadMock()
        const now = new Date().toISOString()
        const item = applyInput(
            {
                id: nextMockId(mock.items),
                ...clean,
                askedAt: '',
                answeredAt: '',
                dueAt: '',
                createdBy: name,
                createdAt: now,
                updatedBy: name,
                updatedAt: now,
            },
            clean
        )
        mock.items.push(item)
        return { item: { ...item }, log: null }
    }

    const body = await postScript({ action: 'createItem', author: name, item: clean })
    const item = normalizeItem(pick(body, 'item'))
    if (!item) throw new Error('บันทึกแล้วแต่อ่านผลไม่ออก — กดรีเฟรชเพื่อดูเรื่องล่าสุด')
    return { item, log: null }
}

/**
 * แก้เรื่อง (บางช่องก็ได้ เช่นลากการ์ดเปลี่ยนแค่สถานะ)
 * @param item เรื่องเดิม — ใช้ `id` + `updatedAt` เช็คว่าไม่มีใครแก้ทับไปก่อน
 * @param changes ช่องที่เปลี่ยน
 * @param author ชื่อผู้แก้ — ฟอร์มแก้ไขต้องส่ง · ลากย้ายสถานะไม่ส่ง (ว่าง = ไม่ระบุชื่อ)
 * @returns เรื่องหลังแก้ + คอมเมนต์บันทึกการย้ายสถานะ (ถ้าสถานะเปลี่ยน)
 * @throws Error เมื่อบันทึกไม่ได้ หรือมีคนแก้ทับไปก่อน
 */
export async function updateTrackingItem(
    item: TrackingItem,
    changes: Partial<TrackingItemInput>,
    author = ''
): Promise<TrackingItemSaveResult> {
    const clean = cleanInput(changes)
    const name = author.trim()

    if (getTrackingMode() !== 'live') {
        const mock = await loadMock()
        const index = mock.items.findIndex((row) => row.id === item.id)
        if (index < 0) throw new Error('ไม่พบเรื่องนี้ หรือเรื่องนี้ถูกซ่อนแล้ว')

        const current = mock.items[index]
        if (current.updatedAt !== item.updatedAt) {
            throw new Error('มีคนแก้เรื่องนี้ไปก่อนแล้ว — กดรีเฟรชแล้วลองใหม่')
        }

        const next = applyInput(
            { ...current, updatedBy: name, updatedAt: new Date().toISOString() },
            clean
        )
        mock.items[index] = next

        // สถานะเปลี่ยน → เขียนบันทึกลงคอมเมนต์ (แบบเดียวกับสคริปต์)
        let log: TrackingComment | null = null
        if (clean.status && clean.status !== current.status) {
            log = {
                id: `C-mock-${mock.comments.length + 1}`,
                itemId: item.id,
                author: name,
                message: statusLogMessage(current.status, clean.status),
                createdAt: next.updatedAt,
            }
            mock.comments.push(log)
        }
        return { item: { ...next }, log }
    }

    const body = await postScript({
        action: 'updateItem',
        author: name,
        id: item.id,
        baseUpdatedAt: item.updatedAt,
        changes: clean,
    })
    const saved = normalizeItem(pick(body, 'item'))
    if (!saved) throw new Error('บันทึกแล้วแต่อ่านผลไม่ออก — กดรีเฟรชเพื่อดูเรื่องล่าสุด')
    return { item: saved, log: normalizeComment(pick(body, 'log')) }
}

/**
 * ซ่อนเรื่องออกจากบอร์ด (ติ๊ก publish ออก) — แถวในชีตยังอยู่ ทีมเปิดกลับได้ในชีต
 * @param item เรื่องที่จะซ่อน
 * @throws Error เมื่อบันทึกไม่ได้ หรือมีคนแก้ทับไปก่อน
 */
export async function archiveTrackingItem(item: TrackingItem): Promise<void> {
    if (getTrackingMode() !== 'live') {
        const mock = await loadMock()
        const current = mock.items.find((row) => row.id === item.id)
        if (current && current.updatedAt !== item.updatedAt) {
            throw new Error('มีคนแก้เรื่องนี้ไปก่อนแล้ว — กดรีเฟรชแล้วลองใหม่')
        }
        mock.items = mock.items.filter((row) => row.id !== item.id)
        return
    }

    await postScript({ action: 'archiveItem', id: item.id, baseUpdatedAt: item.updatedAt })
}
