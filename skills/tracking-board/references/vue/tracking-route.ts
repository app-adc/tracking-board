import { EnumRouter } from '@/types/router'
import type { RouteRecordRaw } from 'vue-router'

/**
 * route หน้าติดตามงาน `/tracking` — หน้าแยกที่ส่งลิงก์ให้ลูกค้า (CEO) ดูเรื่องค้าง/คำถาม/requirement
 *
 * @description
 * บอสเคาะ (9 ต.ค.):
 * - แยกจาก `/doc` ทั้งชุด ไม่ปนของเดิม
 * - **ทุกโหมดรวม prod** (ต่างจาก `/doc` ที่ตัดทิ้งตอน prod) — ไม่ต้องห่อด้วยฟังก์ชัน/เงื่อนไข
 * - **ไม่ต้องล็อกอิน** ไม่มี guard · คอมเมนต์ด้วยการพิมพ์ชื่อเอง
 * - ข้อมูลอยู่ใน Google Sheets ตลอด (ไม่ย้ายไปฐานข้อมูล ATR) — ดู `lib/tracking/`
 */
const trackingRoute: RouteRecordRaw[] = [
    {
        path: '/tracking',
        name: EnumRouter.tracking,
        component: () => import('@/views/tracking/Index.vue'),
        meta: { title: 'ติดตามงาน' },
    },
]

export default trackingRoute
