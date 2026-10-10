<script setup lang="ts">
import { UiBadge } from '@/components/ui'
import {
    TRACKING_BOARD_STATUSES,
    TRACKING_STATUS_LABEL,
    TRACKING_STATUS_TONE,
} from '@/lib/tracking/tracking-labels'
import type { TrackingItem, TrackingStatus } from '@/lib/tracking/tracking-types'
import { Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import TrackingItemCard from './TrackingItemCard.vue'

/**
 * บอร์ดแบบ Trello — 1 คอลัมน์ต่อ 1 สถานะ · ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะ
 *
 * @description
 * เพิ่ม (9 ต.ค. — บอสสั่ง): หน้าติดตามงานต้องจัดการเรื่องได้เหมือน Trello
 * - ใช้ drag & drop ของเบราว์เซอร์ (ไม่เพิ่ม library) — บนมือถือลากไม่ได้ ให้เปลี่ยนสถานะในกล่องรายละเอียดแทน
 * - คอลัมน์ "ไม่ทราบสถานะ" โผล่เฉพาะตอนมีค่าพิมพ์ผิดในชีต · ลากเข้าคอลัมน์นี้ไม่ได้
 * - ไม่ได้ยิง API เอง แค่ยิง event `move` ให้หน้าแม่ (หน้าแม่ย้ายการ์ดทันทีแล้วค่อยบันทึก)
 */

const props = defineProps<{
    items: TrackingItem[]
    commentCount: Map<string, number>
    /**
     * คอลัมน์ที่จะโชว์ (ตามตัวกรองสถานะของหน้า) — null = ครบทุกคอลัมน์
     * @description เพิ่ม (9 ต.ค.): กดการ์ดตัวเลข/แท็บสถานะแล้วบอร์ดเหลือเฉพาะคอลัมน์นั้น
     */
    statuses?: TrackingStatus[] | null
}>()

const emit = defineEmits<{
    open: [id: string]
    move: [id: string, status: Exclude<TrackingStatus, 'unknown'>]
    create: [status: Exclude<TrackingStatus, 'unknown'>]
}>()

/** การ์ดที่กำลังลาก — ใช้ทำการ์ดจาง + เช็คว่าวางคอลัมน์เดิมไหม */
const draggingId = ref('')
/** คอลัมน์ที่ลากผ่านอยู่ — ไฮไลต์ให้เห็นว่าจะวางลงตรงไหน */
const overStatus = ref<TrackingStatus | ''>('')

/** คอลัมน์ทั้งหมด (+ คอลัมน์ไม่ทราบสถานะถ้ามี) พร้อมการ์ดในคอลัมน์ */
const columns = computed(() => {
    const all: TrackingStatus[] = [...TRACKING_BOARD_STATUSES]
    if (props.items.some((item) => item.status === 'unknown')) all.push('unknown')
    const statuses = props.statuses ? all.filter((status) => props.statuses?.includes(status)) : all
    return statuses.map((status) => ({
        status,
        items: props.items.filter((item) => item.status === status),
    }))
})

function onDragEnd() {
    draggingId.value = ''
    overStatus.value = ''
}

/**
 * วางการ์ดลงคอลัมน์
 * @description วางคอลัมน์เดิม/คอลัมน์ไม่ทราบสถานะ = ไม่ทำอะไร
 */
function onDrop(event: DragEvent, status: TrackingStatus) {
    const id = event.dataTransfer?.getData('text/plain') || draggingId.value
    const item = props.items.find((row) => row.id === id)
    onDragEnd()
    if (!item || status === 'unknown' || item.status === status) return
    emit('move', item.id, status)
}
</script>

<template>
    <!-- เลื่อนแนวนอนในกล่องบอร์ดเท่านั้น (แบบ Trello) — ตัวหน้าไม่เลื่อนข้าง -->
    <div class="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div class="flex min-w-max items-start gap-3">
            <section
                v-for="column in columns"
                :key="column.status"
                class="flex w-64 shrink-0 flex-col rounded-card border bg-ground/60 transition-colors"
                :class="
                    overStatus === column.status && column.status !== 'unknown'
                        ? 'border-primary bg-primary-soft/40'
                        : 'border-line'
                "
                :aria-label="`คอลัมน์ ${TRACKING_STATUS_LABEL[column.status]}`"
                @dragover.prevent="overStatus = column.status"
                @dragleave="overStatus === column.status && (overStatus = '')"
                @drop.prevent="onDrop($event, column.status)"
            >
                <header class="flex items-center gap-2 px-3 pt-3 pb-2">
                    <UiBadge :tone="TRACKING_STATUS_TONE[column.status]">
                        {{ TRACKING_STATUS_LABEL[column.status] }}
                    </UiBadge>
                    <span class="text-small tabular-nums text-muted">{{ column.items.length }}</span>
                    <button
                        v-if="column.status !== 'unknown'"
                        type="button"
                        class="ml-auto rounded-md p-1 text-muted hover:bg-panel hover:text-primary"
                        :aria-label="`เพิ่มเรื่องในคอลัมน์ ${TRACKING_STATUS_LABEL[column.status]}`"
                        @click="emit('create', column.status)"
                    >
                        <Plus class="size-4" />
                    </button>
                </header>

                <div class="flex min-h-24 flex-col gap-2 px-2 pb-2">
                    <TrackingItemCard
                        v-for="item in column.items"
                        :key="item.id"
                        :item="item"
                        :comment-count="props.commentCount.get(item.id) ?? 0"
                        compact
                        draggable
                        :class="draggingId === item.id && 'opacity-40'"
                        @open="emit('open', $event)"
                        @dragstart="draggingId = $event"
                        @dragend="onDragEnd"
                    />
                    <p
                        v-if="!column.items.length"
                        class="rounded-control border border-dashed border-line px-3 py-4 text-center text-tiny text-faint"
                    >
                        ลากการ์ดมาวางที่นี่
                    </p>
                </div>

                <button
                    v-if="column.status !== 'unknown'"
                    type="button"
                    class="mx-2 mb-2 flex items-center gap-1.5 rounded-control px-2 py-1.5 text-small text-muted hover:bg-panel hover:text-primary"
                    @click="emit('create', column.status)"
                >
                    <Plus class="size-4" aria-hidden="true" />
                    เพิ่มเรื่อง
                </button>
            </section>
        </div>
    </div>
</template>
