<script setup lang="ts">
import {
    UiButton,
    UiDatePicker,
    UiInput,
    UiModal,
    UiSelect,
    UiTextarea,
} from '@/components/ui'
import { useToast } from '@/composables/use-toast'
import {
    createTrackingItem,
    TRACKING_LIMITS,
    updateTrackingItem,
    validateTrackingAuthor,
    validateTrackingItem,
    type TrackingItemErrors,
} from '@/lib/tracking/tracking-api'
import {
    TRACKING_PRIORITY_OPTIONS,
    TRACKING_STATUS_OPTIONS,
    TRACKING_TYPE_OPTIONS,
} from '@/lib/tracking/tracking-labels'
import type {
    TrackingItem,
    TrackingItemInput,
    TrackingItemSaveResult,
    TrackingStatus,
} from '@/lib/tracking/tracking-types'
import { FilePlus2, Pencil } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

/**
 * ฟอร์มสร้าง/แก้เรื่อง (การ์ดบนบอร์ด)
 *
 * @description
 * เพิ่ม (9 ต.ค. — บอสสั่ง): หน้าติดตามงานต้องสร้างหัวข้อได้แบบ Trello ไม่ใช่ดูอย่างเดียว
 * - `item` = null → สร้างใหม่ (เริ่มที่สถานะ `defaultStatus` = คอลัมน์ที่กด "+ เพิ่มเรื่อง")
 * - `item` มีค่า → แก้เรื่องนั้น · ส่งเฉพาะช่องที่เปลี่ยนจริง (ลดโอกาสทับของคนอื่น)
 * - แก้ไข (9 ต.ค. — บอสเคาะ): ช่อง "ชื่อผู้บันทึก" ต้องพิมพ์เองทุกครั้ง ไม่เติมให้ (แบบเดียวกับคอมเมนต์) ·
 *   ไปลง createdBy/updatedBy · ลากย้ายสถานะบนบอร์ดไม่ถามชื่อ
 */

const props = defineProps<{
    item: TrackingItem | null
    defaultStatus: Exclude<TrackingStatus, 'unknown'>
}>()

const emit = defineEmits<{ saved: [result: TrackingItemSaveResult, isNew: boolean] }>()

const open = defineModel<boolean>({ default: false })

const toast = useToast()

/*------------------------------ ค่าในฟอร์ม ---------------------------------*/

/** แปลง ISO → `yyyy-mm-dd` ตามเวลาเครื่อง */
function isoToInput(iso: string): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** วันนี้แบบ `yyyy-mm-dd` — ค่าเริ่มต้นของ "วันที่ถาม" ตอนสร้างเรื่อง */
function today(): string {
    return isoToInput(new Date().toISOString())
}

/** ค่าเริ่มต้นของฟอร์มจากเรื่องเดิม (แก้) หรือค่าว่าง (สร้าง) */
function toInput(item: TrackingItem | null): TrackingItemInput {
    if (!item) {
        return {
            type: 'question',
            module: '',
            title: '',
            detail: '',
            status: props.defaultStatus,
            priority: 'none',
            askedAt: today(),
            answeredAt: '',
            dueAt: '',
            answer: '',
            release: '',
            blocks: '',
            link: '',
        }
    }
    return {
        type: item.type === 'unknown' ? 'question' : item.type,
        module: item.module,
        title: item.title,
        detail: item.detail,
        // สถานะพิมพ์ผิดในชีต → ให้เลือกใหม่ เริ่มที่รอทีมเรา
        status: item.status === 'unknown' ? 'waiting_team' : item.status,
        priority: item.priority,
        askedAt: isoToInput(item.askedAt),
        answeredAt: isoToInput(item.answeredAt),
        dueAt: isoToInput(item.dueAt),
        answer: item.answer,
        release: item.release,
        blocks: item.blocks,
        link: item.link,
    }
}

const form = ref<TrackingItemInput>(toInput(null))
const errors = ref<TrackingItemErrors>({})
/** ชื่อผู้บันทึก — เริ่มว่างทุกครั้ง ไม่จำ ไม่เติมให้ */
const author = ref('')
const authorError = ref('')
const saving = ref(false)

const isEdit = computed(() => !!props.item)

// เปิดกล่องทุกครั้ง → เติมค่าใหม่จากเรื่องที่เลือก
watch(open, (isOpen) => {
    if (!isOpen) return
    form.value = toInput(props.item)
    errors.value = {}
    author.value = ''
    authorError.value = ''
})

/** ช่องวันที่ ใช้ UiDatePicker (รับ/คืน Date) — แปลงไปมากับ `yyyy-mm-dd` */
function dateModel(key: 'askedAt' | 'answeredAt' | 'dueAt') {
    return computed<Date | null>({
        get: () => (form.value[key] ? new Date(`${form.value[key]}T00:00:00`) : null),
        set: (date) => (form.value[key] = date ? isoToInput(date.toISOString()) : ''),
    })
}
const askedDate = dateModel('askedAt')
const answeredDate = dateModel('answeredAt')
const dueDate = dateModel('dueAt')

/**
 * ช่องที่เปลี่ยนจากค่าเดิม (โหมดแก้)
 * @description ส่งเฉพาะช่องที่เปลี่ยน — ถ้ามีคนอื่นแก้ช่องอื่นอยู่ สคริปต์ยังเช็คทับด้วย updatedAt อยู่ดี
 */
function changedFields(): Partial<TrackingItemInput> {
    const before = toInput(props.item)
    const changes: Partial<TrackingItemInput> = {}
    for (const key of Object.keys(form.value) as (keyof TrackingItemInput)[]) {
        if (form.value[key].trim() !== before[key].trim()) {
            ;(changes as Record<string, string>)[key] = form.value[key]
        }
    }
    return changes
}

/** บันทึก: ตรวจ (รวมชื่อผู้บันทึก) → สร้าง/แก้ → แจ้งหน้าแม่ */
async function submit() {
    if (saving.value) return
    errors.value = validateTrackingItem(form.value)
    authorError.value = validateTrackingAuthor(author.value)
    if (Object.keys(errors.value).length || authorError.value) return

    const changes = isEdit.value ? changedFields() : null
    if (changes && !Object.keys(changes).length) {
        open.value = false
        return
    }

    saving.value = true
    try {
        const result =
            props.item && changes
                ? await updateTrackingItem(props.item, changes, author.value)
                : await createTrackingItem(form.value, author.value)
        emit('saved', result, !props.item)
        toast.success(props.item ? 'บันทึกการแก้ไขแล้ว' : `สร้างเรื่อง ${result.item.id} แล้ว`)
        open.value = false
    } catch (error) {
        toast.error(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', { duration: 0 })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <!-- แก้ไข (9 ต.ค. — บอสสั่ง): คลิกนอกกล่อง/กด Esc แล้วไม่ปิด — ปิดได้จากปุ่มด้านล่างเท่านั้น -->
    <UiModal
        v-model="open"
        size="lg"
        :dismissible="false"
        :icon="isEdit ? Pencil : FilePlus2"
        :title="isEdit ? `แก้ไข ${props.item?.id}` : 'เพิ่มเรื่องใหม่'"
    >
        <form id="tracking-item-form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="submit">
            <UiInput
                v-model="form.title"
                class="sm:col-span-2"
                label="หัวข้อ"
                required
                placeholder="เช่น ใบส่งของ 2 แบบ แยกด้วยเงื่อนไขอะไร"
                :error="errors.title"
            />
            <UiSelect v-model="form.type" label="ประเภท" :options="TRACKING_TYPE_OPTIONS" />
            <UiSelect v-model="form.status" label="สถานะ" :options="TRACKING_STATUS_OPTIONS" />
            <UiSelect v-model="form.priority" label="ความสำคัญ" :options="TRACKING_PRIORITY_OPTIONS" />
            <!-- เพิ่ม (9 ต.ค. — บอสสั่ง): กำหนดเสร็จ -->
            <UiDatePicker
                v-model="dueDate"
                label="กำหนดเสร็จ (Deadline)"
                hint="เลยกำหนดแล้วยังไม่เสร็จ การ์ดขึ้นแดง"
                :error="errors.dueAt"
            />
            <UiInput
                v-model="form.module"
                label="โมดูล"
                placeholder="เช่น QT · SO · DO · สต็อก"
                :error="errors.module"
            />
            <UiInput
                v-model="form.release"
                label="รอบส่งงาน"
                placeholder="เช่น v0.3"
                :error="errors.release"
            />
            <div class="grid grid-cols-2 gap-3">
                <UiDatePicker v-model="askedDate" label="วันที่ถาม" :error="errors.askedAt" />
                <UiDatePicker v-model="answeredDate" label="วันที่ตอบ" :error="errors.answeredAt" />
            </div>
            <UiTextarea
                v-model="form.detail"
                class="sm:col-span-2"
                label="รายละเอียด"
                :rows="4"
                :maxlength="TRACKING_LIMITS.detail"
                :error="errors.detail"
            />
            <UiInput
                v-model="form.blocks"
                class="sm:col-span-2"
                label="งานที่ติดเพราะเรื่องนี้"
                placeholder="เช่น ทำหน้าพิมพ์ใบส่งของได้แบบเดียว"
                :error="errors.blocks"
            />
            <UiTextarea
                v-model="form.answer"
                class="sm:col-span-2"
                label="คำตอบ / ข้อสรุป"
                :rows="3"
                :maxlength="TRACKING_LIMITS.answer"
                :error="errors.answer"
            />
            <UiInput
                v-model="form.link"
                class="sm:col-span-2"
                type="url"
                label="ลิงก์เอกสาร/ภาพประกอบ"
                placeholder="https://"
                :error="errors.link"
            />
            <UiInput
                v-model="author"
                class="sm:col-span-2"
                label="ชื่อผู้บันทึก"
                required
                placeholder="พิมพ์ชื่อของคุณ"
                autocomplete="off"
                hint="ต้องพิมพ์ทุกครั้งที่สร้างหรือแก้ไข"
                :error="authorError"
            />
        </form>

        <template #footer>
            <UiButton variant="outline" @click="open = false">ยกเลิก</UiButton>
            <UiButton type="submit" form="tracking-item-form" :loading="saving">
                {{ isEdit ? 'บันทึก' : 'สร้างเรื่อง' }}
            </UiButton>
        </template>
    </UiModal>
</template>
