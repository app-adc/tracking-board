<script setup lang="ts">
import { UiBadge } from '@/components/ui'
import {
    TRACKING_PRIORITY_LABEL,
    TRACKING_PRIORITY_TONE,
    TRACKING_STALE_DAYS,
    TRACKING_STATUS_LABEL,
    TRACKING_STATUS_TONE,
    TRACKING_TYPE_LABEL,
    trackingDueState,
    trackingOpenDays,
} from '@/lib/tracking/tracking-labels'
import { toThaiDate } from '@/lib/format-date'
import type { TrackingItem } from '@/lib/tracking/tracking-types'
import { Ban, CalendarClock, MessageSquare } from 'lucide-vue-next'
import { computed } from 'vue'

/**
 * การ์ด 1 เรื่อง — ใช้ทั้งบนบอร์ด (ลากได้) และในมุมมองรายการ · กดทั้งการ์ดเพื่อเปิดรายละเอียด
 *
 * @description
 * แก้ไข (9 ต.ค.): เปลี่ยน root จาก `<button>` เป็น `div[role=button]` — Firefox ไม่ยอมเริ่มลาก
 * จากปุ่ม ทำให้ลากการ์ดบนบอร์ดไม่ได้ · กด Enter/Space ยังเปิดได้เหมือนปุ่ม
 * - `compact` = โหมดบอร์ด: ไม่โชว์ป้ายสถานะ (คอลัมน์บอกอยู่แล้ว) และตัดคำตอบออก การ์ดจะได้ไม่ยาว
 */

const props = withDefaults(
    defineProps<{
        item: TrackingItem
        commentCount: number
        compact?: boolean
        draggable?: boolean
    }>(),
    { compact: false, draggable: false }
)

const emit = defineEmits<{
    open: [id: string]
    dragstart: [id: string]
    dragend: []
}>()

/** ค้างกี่วัน — null = ไม่ได้รอคำตอบ/ไม่มีวันที่ */
const openDays = computed(() => trackingOpenDays(props.item.askedAt, props.item.status))

/** กำหนดเสร็จ — null = ไม่กำหนด · เลยกำหนด/ใกล้ถึงมี label + สี */
const due = computed(() => trackingDueState(props.item.dueAt, props.item.status))

/** สีป้ายกำหนดเสร็จ */
const DUE_CLASS = { danger: 'text-danger', warn: 'text-warn', neutral: 'text-faint', ok: 'text-faint', primary: 'text-faint' } as const

/** เริ่มลาก — ใส่รหัสเรื่องใน dataTransfer (Firefox ไม่ยอมลากถ้าไม่ setData) */
function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('text/plain', props.item.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    emit('dragstart', props.item.id)
}
</script>

<template>
    <div
        role="button"
        tabindex="0"
        :draggable="props.draggable"
        class="block w-full rounded-card border border-line bg-panel text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/30 focus-visible:outline-2 focus-visible:outline-primary"
        :class="[props.compact ? 'p-3' : 'p-4', props.draggable && 'cursor-grab active:cursor-grabbing']"
        @click="emit('open', props.item.id)"
        @keydown.enter.prevent="emit('open', props.item.id)"
        @keydown.space.prevent="emit('open', props.item.id)"
        @dragstart="onDragStart"
        @dragend="emit('dragend')"
    >
        <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-tiny text-faint">{{ props.item.id }}</span>
            <UiBadge v-if="!props.compact" :tone="TRACKING_STATUS_TONE[props.item.status]">
                {{ TRACKING_STATUS_LABEL[props.item.status] }}
            </UiBadge>
            <UiBadge tone="neutral" :pill="false">{{ TRACKING_TYPE_LABEL[props.item.type] }}</UiBadge>
            <UiBadge v-if="props.item.module" tone="neutral" :pill="false">
                {{ props.item.module }}
            </UiBadge>
            <UiBadge
                v-if="props.item.priority !== 'none'"
                :tone="TRACKING_PRIORITY_TONE[props.item.priority]"
                :pill="false"
            >
                {{ TRACKING_PRIORITY_LABEL[props.item.priority] }}
            </UiBadge>
            <span
                v-if="openDays !== null"
                class="ml-auto text-tiny font-semibold tabular-nums"
                :class="openDays > TRACKING_STALE_DAYS ? 'text-danger' : 'text-muted'"
            >
                ค้าง {{ openDays }} วัน
            </span>
        </div>

        <p class="mt-2 font-semibold text-ink" :class="props.compact ? 'text-small' : 'text-body'">
            {{ props.item.title }}
        </p>

        <!-- งานที่ติดเพราะเรื่องนี้ — บอกลูกค้าว่าถ้ายังไม่ตอบจะกระทบอะไร -->
        <p v-if="props.item.blocks" class="mt-1 flex items-start gap-1.5 text-small text-warn">
            <Ban class="mt-1 size-3.5 shrink-0" aria-hidden="true" />
            <span>ติดอยู่: {{ props.item.blocks }}</span>
        </p>

        <p v-if="props.item.answer && !props.compact" class="mt-1 line-clamp-2 text-small text-muted">
            คำตอบ: {{ props.item.answer }}
        </p>

        <div
            v-if="props.item.release || props.commentCount || due"
            class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-faint"
        >
            <!-- เพิ่ม (9 ต.ค.): กำหนดเสร็จ — เลยกำหนดเป็นแดง ใกล้ถึงเป็นส้ม -->
            <span
                v-if="due"
                class="inline-flex items-center gap-1"
                :class="[DUE_CLASS[due.tone], due.label && 'font-semibold']"
            >
                <CalendarClock class="size-3.5" aria-hidden="true" />
                กำหนด {{ toThaiDate(props.item.dueAt, false) }}
                <template v-if="due.label">· {{ due.label }}</template>
            </span>
            <span v-if="props.item.release">รอบส่งงาน {{ props.item.release }}</span>
            <span v-if="props.commentCount" class="inline-flex items-center gap-1">
                <MessageSquare class="size-3.5" aria-hidden="true" />
                {{ props.commentCount }}
            </span>
        </div>
    </div>
</template>
