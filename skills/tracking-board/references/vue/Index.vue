<script setup lang="ts">
import StatusLegend from '@/components/shared/StatusLegend.vue'
import {
    UiAlert,
    UiButton,
    UiCard,
    UiConfirm,
    UiEmpty,
    UiInput,
    UiProgress,
    UiSelect,
    UiSkeleton,
    UiStat,
    UiTabs,
    type SelectOption,
    type TabItem,
} from '@/components/ui'
import { useToast } from '@/composables/use-toast'
import { toThaiDateTime } from '@/lib/format-date'
import {
    archiveTrackingItem,
    fetchTrackingData,
    updateTrackingItem,
} from '@/lib/tracking/tracking-api'
import { downloadTrackingCsv } from '@/lib/tracking/tracking-csv'
import {
    TRACKING_BOARD_STATUSES,
    TRACKING_STALE_DAYS,
    TRACKING_STATUS_LABEL,
    TRACKING_STATUS_LEGEND,
    TRACKING_STATUS_ORDER,
    TRACKING_TYPE_LABEL,
    isTrackingOpen,
    trackingOpenDays,
} from '@/lib/tracking/tracking-labels'
import type {
    TrackingComment,
    TrackingData,
    TrackingItem,
    TrackingItemSaveResult,
    TrackingPriority,
    TrackingSource,
    TrackingStatus,
} from '@/lib/tracking/tracking-types'
import { Download, Plus, RefreshCw, Search, X } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TrackingBoard from './components/TrackingBoard.vue'
import TrackingItemCard from './components/TrackingItemCard.vue'
import TrackingItemFormModal from './components/TrackingItemFormModal.vue'
import TrackingItemModal from './components/TrackingItemModal.vue'

/**
 * หน้าติดตามงาน `/tracking` — ส่งลิงก์ให้ลูกค้า (CEO) ดูเรื่องค้างระหว่างเรากับลูกค้า
 *
 * @description
 * เพิ่ม (9 ต.ค. — บอสสั่ง): ตอนส่ง ATR ให้ลูกค้าดู จะมี 3 อย่าง คือตัวระบบ · เอกสาร (/doc) · หน้านี้
 * - รวมคำถามที่ลูกค้ายังไม่ตอบ · requirement ค้าง · ของที่ลูกค้าขอเพิ่ม — เปิดคุยตอนประชุมได้
 * - ข้อมูลอยู่ใน Google Sheets ตลอด (ไม่ย้ายไปฐานข้อมูล ATR)
 * - แก้ไข (9 ต.ค. — บอสตีกลับ "ดูได้อย่างเดียวมันกระจอก"): เป็นบอร์ดแบบ Trello
 *   สร้างเรื่อง · แก้ · ลากย้ายสถานะ · ซ่อน · คอมเมนต์ ได้จากหน้านี้ · บอร์ดเป็นมุมมองเริ่มต้น
 * - ไม่ต้องล็อกอิน (บอสเคาะ — ลองล็อกอิน Google แล้วถอยกลับ) · เก็บชื่อเฉพาะตอนคอมเมนต์ ·
 *   สร้าง/แก้/ลาก/ซ่อน ไม่ระบุชื่อ · ใช้ได้ทุกโหมดรวม prod
 * - ลิงก์ `?item=T-001` เปิดกล่องรายละเอียดเรื่องนั้นให้ทันที — ส่งลิงก์รายเรื่องในแชตได้
 */

const route = useRoute()
const router = useRouter()
const toast = useToast()


/*------------------------------ โหลดข้อมูล ---------------------------------*/

const data = ref<TrackingData>({ items: [], comments: [], fetchedAt: '' })
const source = ref<TrackingSource>('live')
const loading = ref(true)
/** โหลดไม่ได้เลย (ไม่มีข้อมูลที่จำไว้ด้วย) */
const loadError = ref('')
/** โหลดสดไม่ได้ แต่มีชุดที่จำไว้ให้ดู */
const warning = ref('')

/**
 * โหลดข้อมูลจากชีต
 * @description เก็บข้อมูลเดิมไว้ระหว่างโหลดใหม่ — กดรีเฟรชแล้วหน้าไม่กะพริบว่าง
 */
async function load() {
    loading.value = true
    loadError.value = ''
    try {
        const result = await fetchTrackingData()
        data.value = result.data
        source.value = result.source
        warning.value = result.warning
    } catch (error) {
        loadError.value = error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'
    } finally {
        loading.value = false
    }
}

onMounted(load)

/** จำนวนคอมเมนต์ต่อเรื่อง */
const commentCount = computed(() => {
    const counts = new Map<string, number>()
    for (const comment of data.value.comments) {
        counts.set(comment.itemId, (counts.get(comment.itemId) ?? 0) + 1)
    }
    return counts
})

/*------------------------------ การ์ดตัวเลข ---------------------------------*/

/** นับเรื่องตามสถานะ */
function countStatus(status: TrackingStatus): number {
    return data.value.items.filter((item) => item.status === status).length
}

/** รอตอบที่ค้างเกินกำหนด — ให้ลูกค้าเห็นว่าข้อไหนต้องรีบ */
const staleWaitingClient = computed(
    () =>
        data.value.items.filter((item) => {
            if (item.status !== 'waiting_client') return false
            const days = trackingOpenDays(item.askedAt, item.status)
            return days !== null && days > TRACKING_STALE_DAYS
        }).length
)

/** การ์ดตัวเลขที่กดกรองได้ (ใบที่ 4 ความคืบหน้าไม่ใช่สถานะ จึงกดไม่ได้) */
const statCards = computed(() => [
    {
        status: 'waiting_client' as const,
        label: TRACKING_STATUS_LABEL.waiting_client,
        trend: staleWaitingClient.value
            ? `ค้างเกิน ${TRACKING_STALE_DAYS} วัน ${staleWaitingClient.value} เรื่อง`
            : 'ไม่มีเรื่องค้างนาน',
        trendTone: staleWaitingClient.value ? ('danger' as const) : ('neutral' as const),
    },
    { status: 'waiting_team' as const, label: TRACKING_STATUS_LABEL.waiting_team, trend: '', trendTone: 'neutral' as const },
    { status: 'in_progress' as const, label: TRACKING_STATUS_LABEL.in_progress, trend: '', trendTone: 'neutral' as const },
])

/**
 * ความคืบหน้า = เสร็จแล้ว ÷ ทุกเรื่องที่ไม่ได้พักไว้
 * @description พักไว้ไม่นับ เพราะตกลงกันแล้วว่ายังไม่ทำ — นับด้วยจะทำให้ % ไม่มีวันถึง 100
 */
const progress = computed(() => {
    const counted = data.value.items.filter((item) => item.status !== 'on_hold').length
    if (!counted) return 0
    return Math.round((countStatus('done') / counted) * 100)
})

/*------------------------------ ตัวกรอง ---------------------------------*/

const keyword = ref('')
/**
 * ตัวกรองสถานะ — ใช้ร่วมกันทั้งแท็บ · การ์ดตัวเลข · บอร์ด
 * @description แก้ไข (9 ต.ค. — บอสสั่ง): ค่าเริ่มต้นเป็น `all` (ไม่เลือกอะไร) แทน "ยังค้าง" ·
 *              เดิมบอร์ดไม่สนตัวกรองนี้ ตอนนี้บอร์ดโชว์เฉพาะคอลัมน์ที่เลือก
 */
const statusTab = ref<TrackingStatus | 'all' | 'open'>('all')
const typeFilter = ref<string | null>(null)
const moduleFilter = ref<string | null>(null)
const releaseFilter = ref<string | null>(null)
/** มุมมอง — บอร์ดเป็นค่าเริ่มต้น (แบบ Trello) */
const view = ref<'board' | 'list' | 'release'>('board')

const VIEW_OPTIONS = [
    { value: 'board', label: 'บอร์ด' },
    { value: 'list', label: 'รายการ' },
    { value: 'release', label: 'ตามรอบส่งงาน' },
] as const

/** ความกว้างหน้า — บอร์ดใช้เต็มจอให้เห็นครบ 5 คอลัมน์ · มุมมองอื่นจำกัดไว้ให้อ่านง่าย */
const pageWidth = computed(() => (view.value === 'board' ? 'max-w-[1600px]' : 'max-w-6xl'))

/** แท็บสถานะ — "ทั้งหมด" เป็นค่าเริ่มต้น · ซ่อนสถานะที่ไม่มีเรื่อง (ยกเว้นตัวที่เลือกอยู่ จะได้ไม่หายไปใต้มือ) */
const statusTabs = computed<TabItem<TrackingStatus | 'all' | 'open'>[]>(() => {
    const open = data.value.items.filter((item) => isTrackingOpen(item.status)).length
    return [
        { value: 'all', label: 'ทั้งหมด', count: data.value.items.length },
        { value: 'open', label: 'ยังค้าง', count: open },
        ...TRACKING_STATUS_ORDER.filter(
            (status) => countStatus(status) > 0 || statusTab.value === status
        ).map((status) => ({
            value: status,
            label: TRACKING_STATUS_LABEL[status],
            count: countStatus(status),
        })),
    ]
})

/**
 * กดการ์ดตัวเลข → กรองสถานะนั้น · กดซ้ำ = ยกเลิก (กลับเป็นทั้งหมด)
 * @param status สถานะของการ์ด
 */
function toggleStatusFilter(status: TrackingStatus) {
    statusTab.value = statusTab.value === status ? 'all' : status
}

/** คอลัมน์ที่บอร์ดโชว์ตามตัวกรองสถานะ — ทั้งหมด = ครบทุกคอลัมน์ */
const boardStatuses = computed<TrackingStatus[] | null>(() => {
    if (statusTab.value === 'all') return null
    if (statusTab.value === 'open') return TRACKING_BOARD_STATUSES.filter(isTrackingOpen)
    return [statusTab.value]
})

/** ตัวเลือกจากค่าที่มีจริงในชีต (ไม่ตั้งรายการตายตัว — ทีมเพิ่มโมดูล/รอบใหม่ได้เองในชีต) */
function distinctOptions(values: string[]): SelectOption<string>[] {
    return [...new Set(values.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th'))
        .map((value) => ({ value, label: value }))
}

const typeOptions = computed<SelectOption<string>[]>(() =>
    [...new Set(data.value.items.map((item) => item.type))].map((type) => ({
        value: type,
        label: TRACKING_TYPE_LABEL[type],
    }))
)
const moduleOptions = computed(() => distinctOptions(data.value.items.map((item) => item.module)))
const releaseOptions = computed(() => distinctOptions(data.value.items.map((item) => item.release)))

const PRIORITY_RANK: Record<TrackingPriority, number> = { high: 0, medium: 1, low: 2, none: 3 }

/** เรียง: สถานะ (ต้องลงมือก่อน) → ความสำคัญ → กำหนดเสร็จใกล้สุดก่อน (ไม่กำหนดไว้ท้าย) → ถามมานานก่อน */
function compareItems(a: TrackingItem, b: TrackingItem): number {
    return (
        TRACKING_STATUS_ORDER.indexOf(a.status) - TRACKING_STATUS_ORDER.indexOf(b.status) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueAt || '9').localeCompare(b.dueAt || '9') ||
        (a.askedAt || '9').localeCompare(b.askedAt || '9')
    )
}

/** เรื่องที่ผ่านตัวกรองทั้งหมด (เรียงแล้ว) */
const filteredItems = computed(() => {
    const word = keyword.value.trim().toLowerCase()

    return data.value.items
        .filter((item) => {
            if (statusTab.value === 'open' && !isTrackingOpen(item.status)) return false
            if (statusTab.value !== 'open' && statusTab.value !== 'all' && item.status !== statusTab.value) return false
            if (typeFilter.value && item.type !== typeFilter.value) return false
            if (moduleFilter.value && item.module !== moduleFilter.value) return false
            if (releaseFilter.value && item.release !== releaseFilter.value) return false
            if (!word) return true
            // ค้นจากรหัส · หัวข้อ · รายละเอียด · คำตอบ
            return [item.id, item.title, item.detail, item.answer].some((text) =>
                text.toLowerCase().includes(word)
            )
        })
        .sort(compareItems)
})

const hasFilter = computed(
    () =>
        !!keyword.value.trim() ||
        statusTab.value !== 'all' ||
        !!typeFilter.value ||
        !!moduleFilter.value ||
        !!releaseFilter.value
)

/** ล้างตัวกรองทั้งหมดกลับค่าเริ่มต้น (ไม่เลือกอะไรเลย) — มุมมองที่ดูอยู่ไม่เปลี่ยน */
function clearFilters() {
    keyword.value = ''
    statusTab.value = 'all'
    typeFilter.value = null
    moduleFilter.value = null
    releaseFilter.value = null
}

/** ชื่อกลุ่มของเรื่องที่ยังไม่ได้จัดรอบ */
const NO_RELEASE = 'ยังไม่จัดรอบ'

/** มุมมองตามรอบส่งงาน — รอบที่ยังไม่จัดไว้ท้ายสุด · แต่ละรอบมีแถบความคืบหน้า (ไม่นับพักไว้) */
const releaseGroups = computed(() => {
    const groups = new Map<string, TrackingItem[]>()
    for (const item of filteredItems.value) {
        const key = item.release || NO_RELEASE
        groups.set(key, [...(groups.get(key) ?? []), item])
    }

    return [...groups.entries()]
        .sort(([a], [b]) => {
            if (a === NO_RELEASE) return 1
            if (b === NO_RELEASE) return -1
            return a.localeCompare(b, 'th', { numeric: true })
        })
        .map(([name, items]) => {
            // แก้ไข: ความคืบหน้านับจาก "ทุกเรื่องในรอบนั้น" ไม่ใช่เฉพาะที่ผ่านตัวกรอง —
            //        เดิมแท็บเริ่มต้น "ยังค้าง" กรองเรื่องที่เสร็จออก ทำให้ทุกรอบขึ้น "เสร็จ 0/N" ตลอด
            const counted = data.value.items.filter(
                (item) => (item.release || NO_RELEASE) === name && item.status !== 'on_hold'
            )
            return {
                name,
                items,
                done: counted.filter((item) => item.status === 'done').length,
                total: counted.length,
                waitingClient: counted.filter((item) => item.status === 'waiting_client').length,
            }
        })
})

/*------------------------------ กล่องรายละเอียด ---------------------------------*/

/** รหัสเรื่องที่เปิดอยู่ — ผูกกับ `?item=` ให้ส่งลิงก์รายเรื่องได้ */
const selectedId = computed(() => (typeof route.query.item === 'string' ? route.query.item : ''))
const selectedItem = computed(
    () => data.value.items.find((item) => item.id === selectedId.value) ?? null
)
const modalOpen = ref(false)

// เปิดกล่องเมื่อมีเรื่องที่ตรงกับ ?item= (รอโหลดข้อมูลเสร็จก่อน — ลิงก์ที่ส่งมาตรงๆ จะเปิดได้)
watch(selectedItem, (item) => (modalOpen.value = !!item), { immediate: true })

/** เปิดเรื่อง — ใช้ replace ไม่ให้ประวัติเบราว์เซอร์รกด้วยการเปิด/ปิดกล่อง */
function openItem(id: string) {
    router.replace({ query: { ...route.query, item: id } })
}

// ปิดกล่อง (Esc/กากบาท/คลิกฉากหลัง) → เอา ?item= ออก
watch(modalOpen, (isOpen) => {
    if (isOpen || !selectedId.value) return
    const { item: _item, ...rest } = route.query
    router.replace({ query: rest })
})

/** คอมเมนต์ใหม่ (จากกล่อง หรือบันทึกการย้ายสถานะ) — เติมเข้าลิสต์เลย ไม่ต้องโหลดทั้งชุดใหม่ */
function onCommented(comment: TrackingComment) {
    data.value = { ...data.value, comments: [...data.value.comments, comment] }
}

/*------------------------------ สร้าง · แก้ · ย้าย · ซ่อน ---------------------------------*/

/** ใส่เรื่องที่บันทึกแล้วกลับเข้าลิสต์ (แทนตัวเดิม หรือเพิ่มท้ายถ้าเป็นเรื่องใหม่) */
function putItem(item: TrackingItem) {
    const exists = data.value.items.some((row) => row.id === item.id)
    data.value = {
        ...data.value,
        items: exists
            ? data.value.items.map((row) => (row.id === item.id ? item : row))
            : [...data.value.items, item],
    }
}

/** เรื่องที่กำลังบันทึกการย้ายสถานะ — กันลาก/เลือกซ้ำระหว่างรอ */
const movingId = ref('')

/**
 * ย้ายสถานะ (ลากบนบอร์ด หรือเลือกในกล่องรายละเอียด)
 * @description ย้ายการ์ดทันที (ไม่ต้องรอชีต) → บันทึก → พลาดก็ย้ายกลับที่เดิม
 */
async function moveItem(id: string, status: Exclude<TrackingStatus, 'unknown'>) {
    const item = data.value.items.find((row) => row.id === id)
    if (!item || item.status === status || movingId.value) return

    movingId.value = id
    putItem({ ...item, status })
    try {
        const result = await updateTrackingItem(item, { status })
        putItem(result.item)
        if (result.log) onCommented(result.log)
    } catch (error) {
        putItem(item)
        toast.error(error instanceof Error ? error.message : 'ย้ายสถานะไม่สำเร็จ', { duration: 0 })
    } finally {
        movingId.value = ''
    }
}

/** กล่องฟอร์มสร้าง/แก้ */
const formOpen = ref(false)
const formItem = ref<TrackingItem | null>(null)
const formStatus = ref<Exclude<TrackingStatus, 'unknown'>>('waiting_client')

/** เปิดฟอร์มสร้างเรื่อง — `status` = คอลัมน์ที่กด "+ เพิ่มเรื่อง" */
function openCreate(status: Exclude<TrackingStatus, 'unknown'> = 'waiting_client') {
    formItem.value = null
    formStatus.value = status
    formOpen.value = true
}

function openEdit(item: TrackingItem) {
    formItem.value = item
    formOpen.value = true
}

/** บันทึกจากฟอร์มแล้ว — สร้างใหม่จะเปิดกล่องรายละเอียดของเรื่องนั้นให้ (ส่งลิงก์ต่อได้ทันที) */
function onSaved(result: TrackingItemSaveResult, isNew: boolean) {
    putItem(result.item)
    if (result.log) onCommented(result.log)
    if (isNew) openItem(result.item.id)
}

/** กล่องยืนยันซ่อน */
const archiveTarget = ref<TrackingItem | null>(null)
const archiveOpen = ref(false)
const archiving = ref(false)

function askArchive(item: TrackingItem) {
    archiveTarget.value = item
    archiveOpen.value = true
}

/** ซ่อนเรื่องจากบอร์ด — แถวในชีตยังอยู่ (เอาติ๊ก publish ออก) */
async function confirmArchive() {
    const item = archiveTarget.value
    if (!item || archiving.value) return

    archiving.value = true
    try {
        await archiveTrackingItem(item)
        modalOpen.value = false
        data.value = { ...data.value, items: data.value.items.filter((row) => row.id !== item.id) }
        archiveOpen.value = false
        toast.success(`ซ่อน ${item.id} จากบอร์ดแล้ว`)
    } catch (error) {
        toast.error(error instanceof Error ? error.message : 'ซ่อนไม่สำเร็จ', { duration: 0 })
    } finally {
        archiving.value = false
    }
}

function downloadCsv() {
    downloadTrackingCsv(filteredItems.value, data.value.comments)
}
</script>

<template>
    <div class="min-h-svh bg-ground">
        <!-- หัวหน้า -->
        <header class="border-b border-line bg-panel">
            <div
                class="mx-auto flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-6"
                :class="pageWidth"
            >
                <img
                    src="/logo.webp"
                    alt="AUTOPAIR"
                    class="h-7 w-auto rounded-md border border-line bg-white px-2 py-1"
                />
                <div class="min-w-0 flex-1">
                    <h1 class="text-lead font-bold text-ink">ติดตามงาน ATR</h1>
                    <p class="text-small text-muted">
                        คำถามที่รอคำตอบ · requirement ที่ค้าง · ของที่ขอเพิ่ม
                        <template v-if="data.fetchedAt">
                            · ข้อมูล ณ {{ toThaiDateTime(data.fetchedAt) }}
                        </template>
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <UiButton size="sm" :icon="Plus" @click="openCreate()">เพิ่มเรื่อง</UiButton>
                    <UiButton
                        variant="outline"
                        size="sm"
                        :icon="Download"
                        :disabled="!filteredItems.length"
                        @click="downloadCsv"
                    >
                        ดาวน์โหลด CSV
                    </UiButton>
                    <UiButton variant="outline" size="sm" :icon="RefreshCw" :loading="loading" @click="load">
                        รีเฟรช
                    </UiButton>
                </div>
            </div>
        </header>

        <main class="mx-auto flex flex-col gap-5 px-4 py-6 sm:px-6" :class="pageWidth">
            <UiAlert v-if="source === 'mock' && !loadError" tone="primary" title="ข้อมูลตัวอย่าง">
                ยังไม่ได้ต่อ Google Sheets (ไม่ได้ตั้ง <code>VITE_TRACKING_API_URL</code>) — สิ่งที่สร้าง/แก้/คอมเมนต์ตอนนี้อยู่แค่ในหน้านี้ รีเฟรชแล้วหาย
            </UiAlert>
            <UiAlert v-if="warning" tone="warn" title="กำลังแสดงข้อมูลชุดล่าสุดที่เคยโหลดไว้">
                {{ warning }}
            </UiAlert>

            <!-- โหลดไม่ได้เลย -->
            <UiCard v-if="loadError && !data.items.length">
                <UiEmpty title="โหลดข้อมูลไม่สำเร็จ" :description="loadError" />
                <div class="mt-3 flex justify-center">
                    <UiButton :icon="RefreshCw" @click="load">ลองใหม่</UiButton>
                </div>
            </UiCard>

            <template v-else>
                <!-- การ์ดตัวเลข -->
                <!-- 3 ใบแรกกดเพื่อกรองสถานะนั้นได้ · กดซ้ำ = ยกเลิก -->
                <div class="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                    <button
                        v-for="card in statCards"
                        :key="card.status"
                        type="button"
                        class="rounded-card text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
                        :class="statusTab === card.status && 'ring-2 ring-primary'"
                        :aria-pressed="statusTab === card.status"
                        :title="statusTab === card.status ? 'กดอีกครั้งเพื่อยกเลิกตัวกรอง' : `กรองเฉพาะ${card.label}`"
                        @click="toggleStatusFilter(card.status)"
                    >
                        <UiStat
                            class="h-full"
                            :label="card.label"
                            :value="countStatus(card.status)"
                            :trend="card.trend"
                            :trend-tone="card.trendTone"
                            :loading="loading && !data.items.length"
                        />
                    </button>
                    <UiStat
                        label="ความคืบหน้า"
                        :value="`${progress}%`"
                        :trend="`เสร็จ ${countStatus('done')} จาก ${data.items.length - countStatus('on_hold')} เรื่อง (ไม่นับพักไว้)`"
                        trend-tone="ok"
                        :loading="loading && !data.items.length"
                    />
                </div>

                <!-- ตัวกรอง -->
                <UiCard padding="sm">
                    <div class="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                        <UiTabs v-model="statusTab" :items="statusTabs" class="min-w-0" />
                        <UiButton
                            variant="ghost"
                            size="sm"
                            :icon="X"
                            :disabled="!hasFilter"
                            @click="clearFilters"
                        >
                            ล้างตัวกรองทั้งหมด
                        </UiButton>
                    </div>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <UiInput
                            v-model="keyword"
                            type="search"
                            placeholder="ค้นรหัส · หัวข้อ · รายละเอียด"
                            :icon="Search"
                            clearable
                        />
                        <UiSelect v-model="typeFilter" :options="typeOptions" placeholder="ทุกประเภท" clearable />
                        <UiSelect v-model="moduleFilter" :options="moduleOptions" placeholder="ทุกโมดูล" searchable clearable />
                        <UiSelect v-model="releaseFilter" :options="releaseOptions" placeholder="ทุกรอบส่งงาน" clearable />
                    </div>
                    <StatusLegend :items="TRACKING_STATUS_LEGEND" embedded />
                </UiCard>

                <!-- สลับมุมมอง -->
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-small text-muted">
                        {{ filteredItems.length }} เรื่อง
                        <template v-if="hasFilter">(กรองอยู่)</template>
                    </p>
                    <div class="inline-flex rounded-control border border-line bg-panel p-0.5 text-small" role="group" aria-label="มุมมอง">
                        <button
                            v-for="option in VIEW_OPTIONS"
                            :key="option.value"
                            type="button"
                            class="rounded-md px-3 py-1"
                            :class="view === option.value ? 'bg-primary text-white' : 'text-muted hover:text-ink'"
                            :aria-pressed="view === option.value"
                            @click="view = option.value"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>

                <!-- กำลังโหลดครั้งแรก -->
                <div v-if="loading && !data.items.length" class="flex flex-col gap-3">
                    <UiSkeleton v-for="n in 4" :key="n" height="5.5rem" />
                </div>

                <!-- มุมมองบอร์ด — คอลัมน์ว่างก็ยังโชว์ (มีปุ่มเพิ่มเรื่อง/ที่วางการ์ด) -->
                <TrackingBoard
                    v-else-if="view === 'board'"
                    :items="filteredItems"
                    :statuses="boardStatuses"
                    :comment-count="commentCount"
                    @open="openItem"
                    @move="moveItem"
                    @create="openCreate"
                />

                <UiCard v-else-if="!filteredItems.length">
                    <UiEmpty
                        :title="data.items.length ? 'ไม่มีเรื่องที่ตรงกับตัวกรอง' : 'ยังไม่มีเรื่องให้ติดตาม'"
                        :description="data.items.length ? 'ลองเปลี่ยนแท็บหรือล้างตัวกรอง' : 'กด เพิ่มเรื่อง เพื่อเริ่ม'"
                    />
                </UiCard>

                <!-- มุมมองรายการ -->
                <div v-else-if="view === 'list'" class="flex flex-col gap-2.5">
                    <TrackingItemCard
                        v-for="item in filteredItems"
                        :key="item.id"
                        :item="item"
                        :comment-count="commentCount.get(item.id) ?? 0"
                        @open="openItem"
                    />
                </div>

                <!-- มุมมองตามรอบส่งงาน -->
                <div v-else class="flex flex-col gap-6">
                    <section v-for="group in releaseGroups" :key="group.name">
                        <div class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h2 class="text-lead font-bold text-ink">
                                {{ group.name === NO_RELEASE ? group.name : `รอบส่งงาน ${group.name}` }}
                            </h2>
                            <span class="text-small text-muted">
                                เสร็จ {{ group.done }}/{{ group.total }}
                                <template v-if="group.waitingClient">
                                    · <span class="font-semibold text-warn">รอตอบ {{ group.waitingClient }}</span>
                                </template>
                            </span>
                        </div>
                        <UiProgress
                            :value="group.done"
                            :max="group.total || 1"
                            tone="ok"
                            size="sm"
                            :label="`ความคืบหน้า ${group.name}`"
                            class="mb-3"
                        />
                        <div class="flex flex-col gap-2.5">
                            <TrackingItemCard
                                v-for="item in group.items"
                                :key="item.id"
                                :item="item"
                                :comment-count="commentCount.get(item.id) ?? 0"
                                @open="openItem"
                            />
                        </div>
                    </section>
                </div>
            </template>
        </main>

        <TrackingItemModal
            v-model="modalOpen"
            :item="selectedItem"
            :comments="data.comments"
            :moving="!!movingId"
            @commented="onCommented"
            @move="moveItem"
            @edit="openEdit"
            @archive="askArchive"
        />
        <TrackingItemFormModal
            v-model="formOpen"
            :item="formItem"
            :default-status="formStatus"
            @saved="onSaved"
        />
        <UiConfirm
            v-model="archiveOpen"
            :title="`ซ่อน ${archiveTarget?.id ?? ''} จากบอร์ด?`"
            message="เรื่องนี้จะหายจากบอร์ดของทุกคน แต่แถวในชีตยังอยู่ — ทีมเปิดกลับได้โดยติ๊ก publish ในชีต"
            confirm-text="ซ่อน"
            :loading="archiving"
            @confirm="confirmArchive"
        />

    </div>
</template>
