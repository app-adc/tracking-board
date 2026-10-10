//----------------------   หน้าติดตามงาน (/tracking)   --------------------------//
// ชนิดข้อมูลของหน้าติดตามงานที่ส่งให้ลูกค้าดู — ข้อมูลอยู่ใน Google Sheets (ไม่ใช่ฐานข้อมูลของแอป)
//
// @description
// ผู้ใช้เคาะ (9 ต.ค.): หน้านี้ใช้ Google Sheets ตลอด ต่อให้แอปขึ้นโปรดักชันต่อฐานข้อมูลจริงแล้วก็ไม่ย้าย
// จึงแยกทั้งก้อนไว้ใน `lib/tracking/` ไม่ปนกับ store / state ของระบบหลัก
// แก้ไข (9 ต.ค.): ผู้ใช้ตีกลับว่าต้องเป็นบอร์ดแบบ Trello — สร้าง/แก้/ย้ายสถานะ/ซ่อนเรื่องได้จากหน้าเว็บ ไม่ใช่ดูอย่างเดียว

/** ประเภทเรื่อง — คีย์ภายใน (ในชีตพิมพ์เป็นคำไทยได้ ดู `tracking-labels.ts`) */
export type TrackingType = 'question' | 'requirement' | 'request' | 'bug' | 'decision'

/**
 * สถานะเรื่อง
 * - `waiting_client` รอตอบ/ตัดสินใจ
 * - `waiting_team` รอทีมเราตอบ/ตรวจ
 * - `in_progress` กำลังทำ
 * - `done` เสร็จแล้ว
 * - `on_hold` พักไว้
 * - `unknown` ค่าในชีตอ่านไม่ออก (พิมพ์ผิด) — แสดงป้ายเทาแทนการพังทั้งหน้า
 */
export type TrackingStatus =
    | 'waiting_client'
    | 'waiting_team'
    | 'in_progress'
    | 'done'
    | 'on_hold'
    | 'unknown'

/** ความสำคัญ — `none` = ไม่ได้กรอก */
export type TrackingPriority = 'high' | 'medium' | 'low' | 'none'

/** 1 เรื่องในแท็บ `items` ของชีต (เฉพาะแถวที่ติ๊ก `publish` — แถวที่ซ่อน Apps Script ไม่ส่งมาเลย) */
export type TrackingItem = {
    /** รหัสเรื่อง เช่น `T-001` — ใช้ผูกคอมเมนต์ */
    id: string
    type: TrackingType | 'unknown'
    /** โมดูลที่เกี่ยว เช่น `QT` `SO` `สต็อก` — ข้อความอิสระ */
    module: string
    title: string
    detail: string
    status: TrackingStatus
    priority: TrackingPriority
    /** วันที่ถาม/เปิดเรื่อง (ISO) — ว่างได้ */
    askedAt: string
    /** วันที่ได้คำตอบ (ISO) — ว่างได้ */
    answeredAt: string
    /**
     * กำหนดเสร็จ / Deadline (ISO) — ว่าง = ไม่กำหนด
     * @description เพิ่ม (9 ต.ค. — ผู้ใช้สั่ง): เลยกำหนดแล้วยังไม่เสร็จ การ์ดขึ้นแดง
     */
    dueAt: string
    /** คำตอบหรือข้อสรุปที่ทีมสรุปลงชีตแล้ว */
    answer: string
    /** รอบส่งงาน เช่น `v0.3` — ว่าง = ยังไม่ได้จัดรอบ */
    release: string
    /** งานที่ติดเพราะเรื่องนี้ เช่น "ทำหน้าเมนู Back Order ไม่ได้" */
    blocks: string
    /** ลิงก์เอกสาร/ภาพประกอบ — รับเฉพาะ http(s) */
    link: string
    /** ชื่อคนสร้างเรื่อง (พิมพ์เอง) — แถวที่ทีมกรอกในชีตเองอาจว่าง */
    createdBy: string
    /** ISO */
    createdAt: string
    /** ชื่อคนแก้ล่าสุด */
    updatedBy: string
    /**
     * เวลาแก้ล่าสุด (ISO) — ส่งกลับไปตอนแก้ ให้สคริปต์เช็คว่าไม่มีใครแก้ทับไปก่อน
     * @description ว่าง = ยังไม่เคยแก้ผ่านหน้าเว็บ
     */
    updatedAt: string
}

/** ช่องที่สร้าง/แก้ได้จากหน้าเว็บ (วันที่เป็น `yyyy-mm-dd` หรือว่าง) */
export type TrackingItemInput = {
    type: TrackingType
    module: string
    title: string
    detail: string
    /** สถานะที่ตั้งได้ — ห้ามตั้งเป็น `unknown` */
    status: Exclude<TrackingStatus, 'unknown'>
    priority: TrackingPriority
    askedAt: string
    answeredAt: string
    dueAt: string
    answer: string
    release: string
    blocks: string
    link: string
}

/** ผลของการสร้าง/แก้เรื่อง — `log` = คอมเมนต์บันทึกการย้ายสถานะที่สคริปต์เขียนให้ (ถ้ามี) */
export type TrackingItemSaveResult = {
    item: TrackingItem
    log: TrackingComment | null
}

/** 1 คอมเมนต์ในแท็บ `comments` */
export type TrackingComment = {
    id: string
    itemId: string
    /** ชื่อที่ผู้คอมเมนต์พิมพ์เอง — ไม่มีล็อกอิน (ผู้ใช้เคาะ) */
    author: string
    message: string
    /** ISO */
    createdAt: string
}

/** ข้อมูลทั้งชุดที่หน้าเว็บโหลดมา */
export type TrackingData = {
    items: TrackingItem[]
    comments: TrackingComment[]
    /** เวลาที่โหลด (ISO) — ใช้บอก "ข้อมูล ณ ..." */
    fetchedAt: string
}

/**
 * ข้อมูลที่ส่งไปบันทึกคอมเมนต์
 * @description ผู้คอมเมนต์พิมพ์ชื่อเองทุกครั้ง (ไม่มีล็อกอิน · ผู้ใช้เคาะ 9 ต.ค.)
 */
export type TrackingCommentPayload = {
    itemId: string
    author: string
    message: string
}

/** ที่มาของข้อมูลที่กำลังแสดง */
export type TrackingSource =
    /** โหลดสดจาก Google Sheets */
    | 'live'
    /** โหลดไม่ได้ ใช้ชุดล่าสุดที่จำไว้ในเครื่อง */
    | 'cache'
    /** ยังไม่ได้ตั้ง URL ของ Apps Script — ใช้ข้อมูลตัวอย่าง (ไม่ใช่ build จริง) */
    | 'mock'
