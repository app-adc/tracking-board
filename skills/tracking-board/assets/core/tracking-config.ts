//----------------------   ตั้งค่าบอร์ดติดตามงาน — ไฟล์เดียวที่ต้องปรับตามเฟรมเวิร์ก   --------------------------//
// โค้ดแกนไฟล์อื่น (types · labels · api · csv · mock) เป็น TypeScript ล้วน ไม่ผูกเฟรมเวิร์ก
// อ่านค่าตั้งต้นจากไฟล์นี้ที่เดียว — ย้ายโปรเจกต์ไปเฟรมเวิร์กไหน แก้แค่ 2 ค่าข้างล่าง
//
// ตัวอย่างต่อเฟรมเวิร์ก (เลือกบรรทัดที่ตรง ลบที่เหลือ):
//   Vite (Vue/React/Svelte) : import.meta.env.VITE_TRACKING_API_URL        · import.meta.env.PROD
//   Next.js                 : process.env.NEXT_PUBLIC_TRACKING_API_URL      · process.env.NODE_ENV === 'production'
//   Nuxt 3                  : useRuntimeConfig().public.trackingApiUrl      · !import.meta.dev
//   Create React App        : process.env.REACT_APP_TRACKING_API_URL        · process.env.NODE_ENV === 'production'
//
// ⚠️ URL นี้ไม่ใช่ความลับ (ใครเปิดหน้าเว็บก็เห็น) — ใส่ใน env ฝั่ง client ได้

/** URL ของ Google Apps Script Web App (ลงท้าย `/exec`) · ว่าง = ยังไม่ได้ต่อชีต */
export const TRACKING_API_URL: string = (import.meta.env.VITE_TRACKING_API_URL ?? '').trim()

/**
 * build จริงไหม
 * @description ไม่ได้ตั้ง URL: build จริง → ขึ้น "ยังไม่ได้ตั้งค่า" (ห้ามโชว์ข้อมูลปลอมให้ผู้ใช้) ·
 *              ตอนพัฒนา → ใช้ข้อมูลตัวอย่างในหน่วยความจำ
 *              โปรเจกต์ที่ build หลายโหมด (dev/staging/prod) ปรับให้ true เฉพาะโหมดที่ผู้ใช้จริงเห็น
 */
export const TRACKING_IS_PRODUCTION: boolean = import.meta.env.PROD
