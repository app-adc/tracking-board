//----------------------   ข้อมูลตัวอย่างของหน้าติดตามงาน   --------------------------//
// ใช้เฉพาะตอนยังไม่ได้ตั้ง URL ของ Apps Script และไม่ใช่ build จริง (ดู tracking-config.ts)
// ⚠️ เป็นข้อมูลสมมติไว้ดูหน้าตาเท่านั้น — ข้อมูลจริงอยู่ใน Google Sheets

import type { TrackingComment, TrackingItem } from './tracking-types'

/** วันที่ย้อนหลัง N วันจากวันนี้ (ISO) — ให้ป้าย "ค้าง N วัน" ในตัวอย่างดูสมจริงทุกวันที่เปิด */
function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString()
}

/** ช่องที่ว่างเป็นค่าเริ่มต้น — แต่ละเรื่องใส่เฉพาะช่องที่ต่าง */
const BLANK: Omit<TrackingItem, 'id' | 'title' | 'type' | 'status'> = {
    module: '',
    detail: '',
    priority: 'none',
    askedAt: '',
    answeredAt: '',
    dueAt: '',
    answer: '',
    release: '',
    blocks: '',
    link: '',
    createdBy: '',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
}

export const MOCK_TRACKING_ITEMS: TrackingItem[] = [
    {
        ...BLANK,
        id: 'T-001',
        type: 'question',
        module: 'DO',
        title: '(ตัวอย่าง) ใบส่งของ 2 แบบ แยกด้วยเงื่อนไขอะไร',
        detail: 'ใบกำกับภาษี/ใบส่งสินค้า กับ ใบส่งสินค้า — ตัดสินจากลูกค้าจด VAT · เงื่อนไขชำระเงินสด · หรือให้เลือกตอนออกใบ?',
        status: 'waiting_client',
        priority: 'high',
        askedAt: daysAgo(12),
        dueAt: daysAgo(2),
        release: 'v0.3',
        blocks: 'ทำหน้าพิมพ์ใบส่งของได้แบบเดียว',
    },
    {
        ...BLANK,
        id: 'T-002',
        type: 'question',
        module: 'ราคา',
        title: '(ตัวอย่าง) ราคาทุน FIT/HERO ให้กรอกเองหรือดึงจากระบบ',
        status: 'waiting_client',
        priority: 'medium',
        askedAt: daysAgo(5),
        release: 'v0.3',
    },
    {
        ...BLANK,
        id: 'T-003',
        type: 'request',
        module: 'สต็อก',
        title: '(ตัวอย่าง) รายงานการเคลื่อนไหวสินค้าเป็น Excel',
        detail: 'ลูกค้าขอรายงานรายสินค้า เลือกช่วงวันที่ได้',
        status: 'waiting_team',
        priority: 'medium',
        askedAt: daysAgo(3),
        dueAt: daysAgo(-1),
        release: 'v0.4',
    },
    {
        ...BLANK,
        id: 'T-004',
        type: 'requirement',
        module: 'คืน/เคลม',
        title: '(ตัวอย่าง) ใบเคลมเลือกส่งไปผู้จำหน่ายนอกได้',
        status: 'in_progress',
        priority: 'high',
        askedAt: daysAgo(9),
        answeredAt: daysAgo(7),
        answer: 'ลูกค้าเลือกทาง B — ปุ่ม "เคลมไปที่" คลังของเรา / ผู้จำหน่ายนอก',
        release: 'v0.3',
    },
    {
        ...BLANK,
        id: 'T-005',
        type: 'decision',
        module: 'SO',
        title: '(ตัวอย่าง) จองของตอนเปิดขาย ตัดสต็อกตอนจัดส่ง',
        status: 'done',
        priority: 'high',
        askedAt: daysAgo(20),
        answeredAt: daysAgo(18),
        answer: 'ตกลงทาง ข',
        release: 'v0.2',
    },
    {
        ...BLANK,
        id: 'T-006',
        type: 'question',
        module: 'อะไหล่',
        title: '(ตัวอย่าง) สินค้า 1 ตัวมีหลายรหัส — จำเป็นในเฟสนี้ไหม',
        status: 'on_hold',
        priority: 'low',
        askedAt: daysAgo(30),
    },
]

export const MOCK_TRACKING_COMMENTS: TrackingComment[] = [
    {
        id: 'C-mock-1',
        itemId: 'T-001',
        author: '(ตัวอย่าง) ทีมพัฒนา',
        message: 'ถ้ายังไม่สะดวกตอบ ทีมจะทำแบบใบกำกับภาษีไปก่อนนะคะ',
        createdAt: daysAgo(4),
    },
]
