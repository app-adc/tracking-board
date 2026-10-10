//----------------------   ดาวน์โหลดรายการติดตามงานเป็น CSV   --------------------------//

import {
    TRACKING_PRIORITY_LABEL,
    TRACKING_STATUS_LABEL,
    TRACKING_TYPE_LABEL,
} from './tracking-labels'
import { TRACKING_ID } from './tracking-config'
import type { TrackingComment, TrackingItem } from './tracking-types'

/**
 * วันที่แบบไทยสั้น เช่น `9 ต.ค. 69` — ว่าง/อ่านไม่ออกได้ค่าว่าง
 * @description แก้ไข (แพ็กเป็นสกิล): เดิมใช้ตัวจัดวันที่ของโปรเจกต์ต้นทาง · โปรเจกต์ที่มีตัวจัดวันที่กลางอยู่แล้วเปลี่ยนไปใช้ของโปรเจกต์ได้
 */
function toThaiDate(iso: string): string {
    const date = new Date(iso)
    if (!iso || Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

/**
 * ทำ 1 ช่องให้ปลอดภัยสำหรับ CSV
 * @description
 * - ครอบด้วย `"` และเบิ้ล `"` ข้างใน (มาตรฐาน CSV)
 * - ขึ้นต้นด้วย `= + - @` → เติม `'` นำหน้า กัน Excel ตีความเป็นสูตร (CSV injection)
 *   เพราะคอมเมนต์มาจากใครก็ได้ที่มีลิงก์
 */
function csvCell(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
}

/**
 * สร้างไฟล์ CSV แล้วสั่งดาวน์โหลด
 * @param items เรื่องที่จะออก (ตามตัวกรองที่เลือกอยู่)
 * @param comments คอมเมนต์ทั้งหมด — นับจำนวนต่อเรื่อง และรวมข้อความล่าสุด
 */
export function downloadTrackingCsv(items: TrackingItem[], comments: TrackingComment[]) {
    const header = [
        'รหัส', 'ประเภท', 'โมดูล', 'หัวข้อ', 'รายละเอียด', 'สถานะ', 'ความสำคัญ',
        'วันที่ถาม', 'วันที่ตอบ', 'กำหนดเสร็จ', 'คำตอบ', 'รอบส่งงาน', 'งานที่ติด', 'จำนวนคอมเมนต์', 'คอมเมนต์ล่าสุด',
    ]

    const rows = items.map((item) => {
        const own = comments.filter((comment) => comment.itemId === item.id)
        const latest = own.at(-1)
        return [
            item.id,
            TRACKING_TYPE_LABEL[item.type],
            item.module,
            item.title,
            item.detail,
            TRACKING_STATUS_LABEL[item.status],
            item.priority === 'none' ? '' : TRACKING_PRIORITY_LABEL[item.priority],
            item.askedAt ? toThaiDate(item.askedAt) : '',
            item.answeredAt ? toThaiDate(item.answeredAt) : '',
            item.dueAt ? toThaiDate(item.dueAt) : '',
            item.answer,
            item.release,
            item.blocks,
            String(own.length),
            latest ? `${latest.author}: ${latest.message}` : '',
        ]
    })

    // BOM นำหน้า — ไม่งั้น Excel เปิดภาษาไทยเป็นตัวต่างดาว
    const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))

    const link = document.createElement('a')
    link.href = url
    link.download = `${TRACKING_ID}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    // คืนหน่วยความจำทีหลัง — revoke ทันทีบางเบราว์เซอร์ยังไม่ทันเริ่มดาวน์โหลด
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
