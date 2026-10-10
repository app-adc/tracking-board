<script setup lang="ts">
import { UiBadge, UiButton, UiInput, UiModal, UiSelect, UiTextarea } from '@/components/ui'
import { useToast } from '@/composables/use-toast'
import { toThaiDate, toThaiDateTime } from '@/lib/format-date'
import {
    postTrackingComment,
    TRACKING_LIMITS,
    validateTrackingAuthor,
    validateTrackingMessage,
} from '@/lib/tracking/tracking-api'
import {
    TRACKING_PRIORITY_LABEL,
    TRACKING_PRIORITY_TONE,
    TRACKING_STATUS_OPTIONS,
    TRACKING_TYPE_LABEL,
    trackingDueState,
} from '@/lib/tracking/tracking-labels'
import type { TrackingComment, TrackingItem, TrackingStatus } from '@/lib/tracking/tracking-types'
import { ClipboardList, EyeOff, ExternalLink, Pencil, Send } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

/**
 * กล่องรายละเอียด 1 เรื่อง — ย้ายสถานะ · แก้ไข · ซ่อน · คอมเมนต์
 *
 * @description
 * - แก้ไข (9 ต.ค. — บอสสั่งให้เป็นแบบ Trello): เดิมดู + คอมเมนต์ได้อย่างเดียว
 *   ตอนนี้ย้ายสถานะได้จากตัวเลือกบนหัวกล่อง (ใช้แทนการลากบนมือถือ) · ปุ่มแก้ไข · ปุ่มซ่อนจากบอร์ด
 * - การย้าย/แก้/ซ่อน **ยิง event ให้หน้าแม่เป็นคนบันทึก** (รวมการเขียนเรื่องไว้จุดเดียวกับการลากบนบอร์ด)
 *   ส่วนคอมเมนต์บันทึกเองในกล่องนี้
 * - แก้ไข (9 ต.ค. — บอสสั่ง): ชื่อผู้คอมเมนต์**ต้องพิมพ์เองทุกครั้ง ไม่เติมให้** —
 *   ถ้าเติมชื่อเดิมไว้ คนจะมักง่ายไม่แก้ชื่อตัวเอง (ลองล็อกอิน Google แล้วบอสถอยกลับมาแบบนี้)
 * - ข้อความทุกช่องแสดงแบบตัวหนังสือล้วน (`{{ }}`) ไม่ใช้ v-html
 */

const props = defineProps<{
    item: TrackingItem | null
    comments: TrackingComment[]
    /** กำลังบันทึกการย้ายสถานะอยู่ */
    moving?: boolean
}>()

const emit = defineEmits<{
    commented: [comment: TrackingComment]
    move: [id: string, status: Exclude<TrackingStatus, 'unknown'>]
    edit: [item: TrackingItem]
    archive: [item: TrackingItem]
}>()

const open = defineModel<boolean>({ default: false })

const toast = useToast()
/** ชื่อผู้คอมเมนต์ — เริ่มว่างทุกครั้ง ไม่จำ ไม่เติมให้ */
const commentAuthor = ref('')
const authorError = ref('')
const message = ref('')
const messageError = ref('')
const sending = ref(false)

/** คอมเมนต์ของเรื่องนี้ เก่า → ใหม่ (อ่านเป็นบทสนทนา) */
const ownComments = computed(() =>
    props.comments
        .filter((comment) => comment.itemId === props.item?.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
)

/** ค่าของตัวเลือกสถานะ — สถานะพิมพ์ผิดในชีตให้เป็นค่าว่าง (ยังไม่เลือก) */
const statusValue = computed(() =>
    props.item && props.item.status !== 'unknown' ? props.item.status : null
)

function onStatusChange(status: Exclude<TrackingStatus, 'unknown'> | null) {
    if (!props.item || !status || status === props.item.status) return
    emit('move', props.item.id, status)
}

/** สถานะกำหนดเสร็จ (เลยกำหนด/ใกล้ถึง) */
const due = computed(() => (props.item ? trackingDueState(props.item.dueAt, props.item.status) : null))

// เปิดกล่องใหม่/เปลี่ยนเรื่อง → ล้างชื่อและข้อความที่พิมพ์ค้าง
watch([open, () => props.item?.id], () => {
    commentAuthor.value = ''
    authorError.value = ''
    message.value = ''
    messageError.value = ''
})

/**
 * ส่งคอมเมนต์
 * @description ตรวจชื่อ + ข้อความ → บันทึก → ล้างทั้งชื่อและข้อความ (คนถัดไปต้องพิมพ์ชื่อตัวเอง) → แจ้งหน้าแม่
 */
async function submit() {
    if (!props.item || sending.value) return

    authorError.value = validateTrackingAuthor(commentAuthor.value)
    messageError.value = validateTrackingMessage(message.value)
    if (authorError.value || messageError.value) return

    sending.value = true
    try {
        const comment = await postTrackingComment({
            itemId: props.item.id,
            author: commentAuthor.value,
            message: message.value,
        })
        message.value = ''
        commentAuthor.value = ''
        emit('commented', comment)
        toast.success('ส่งคอมเมนต์แล้ว')
    } catch (error) {
        toast.error(error instanceof Error ? error.message : 'ส่งคอมเมนต์ไม่สำเร็จ', { duration: 0 })
    } finally {
        sending.value = false
    }
}
</script>

<template>
    <!-- แก้ไข (9 ต.ค. — บอสสั่ง): คลิกนอกกล่อง/กด Esc แล้วไม่ปิด — ปิดได้จากปุ่มด้านล่างเท่านั้น -->
    <UiModal
        v-model="open"
        size="lg"
        :dismissible="false"
        :icon="ClipboardList"
        :title="props.item ? `${props.item.id} · ${props.item.title}` : ''"
    >
        <div v-if="props.item" class="flex flex-col gap-5">
            <!-- แถบจัดการ: ย้ายสถานะ · แก้ไข · ซ่อน -->
            <div class="flex flex-wrap items-end gap-2">
                <UiSelect
                    class="w-48"
                    size="sm"
                    label="สถานะ"
                    :model-value="statusValue"
                    :options="TRACKING_STATUS_OPTIONS"
                    :disabled="props.moving"
                    placeholder="ไม่ทราบสถานะ — เลือกใหม่"
                    @change="onStatusChange"
                />
                <div class="ml-auto flex gap-2">
                    <UiButton variant="outline" size="sm" :icon="Pencil" @click="emit('edit', props.item)">
                        แก้ไข
                    </UiButton>
                    <UiButton variant="ghost" size="sm" :icon="EyeOff" @click="emit('archive', props.item)">
                        ซ่อนจากบอร์ด
                    </UiButton>
                </div>
            </div>

            <!-- ป้ายสรุป -->
            <div class="flex flex-wrap items-center gap-1.5">
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
            </div>

            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-small sm:grid-cols-3">
                <div>
                    <dt class="text-muted">วันที่ถาม</dt>
                    <dd class="text-ink">{{ toThaiDate(props.item.askedAt) }}</dd>
                </div>
                <div>
                    <dt class="text-muted">วันที่ตอบ</dt>
                    <dd class="text-ink">{{ toThaiDate(props.item.answeredAt) }}</dd>
                </div>
                <div>
                    <dt class="text-muted">กำหนดเสร็จ</dt>
                    <dd class="text-ink">
                        {{ toThaiDate(props.item.dueAt) }}
                        <UiBadge v-if="due?.label" :tone="due.tone" :pill="false" class="ml-1">
                            {{ due.label }}
                        </UiBadge>
                    </dd>
                </div>
                <div>
                    <dt class="text-muted">รอบส่งงาน</dt>
                    <dd class="text-ink">{{ props.item.release || '—' }}</dd>
                </div>
                <div v-if="props.item.createdBy">
                    <dt class="text-muted">สร้างโดย</dt>
                    <dd class="text-ink">{{ props.item.createdBy }}</dd>
                </div>
                <div v-if="props.item.updatedBy">
                    <dt class="text-muted">แก้ล่าสุด</dt>
                    <dd class="text-ink">
                        {{ props.item.updatedBy }} · {{ toThaiDateTime(props.item.updatedAt, false) }}
                    </dd>
                </div>
            </dl>

            <section v-if="props.item.detail">
                <h3 class="mb-1 text-small font-semibold text-muted">รายละเอียด</h3>
                <p class="whitespace-pre-line text-body text-ink">{{ props.item.detail }}</p>
            </section>

            <section
                v-if="props.item.blocks"
                class="rounded-control bg-warn-soft px-3 py-2 text-small text-warn"
            >
                <strong>งานที่ติดเพราะเรื่องนี้:</strong> {{ props.item.blocks }}
            </section>

            <section v-if="props.item.answer" class="rounded-control bg-ok-soft px-3 py-2">
                <h3 class="mb-0.5 text-small font-semibold text-ok">คำตอบ / ข้อสรุป</h3>
                <p class="whitespace-pre-line text-body text-ink">{{ props.item.answer }}</p>
            </section>

            <a
                v-if="props.item.link"
                :href="props.item.link"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 self-start text-small text-primary hover:underline"
            >
                <ExternalLink class="size-3.5" aria-hidden="true" />
                เปิดเอกสาร/ภาพประกอบ
            </a>

            <!-- คอมเมนต์ -->
            <section class="border-t border-line pt-4">
                <h3 class="mb-2 text-small font-semibold text-muted">
                    คอมเมนต์ ({{ ownComments.length }})
                </h3>

                <p v-if="!ownComments.length" class="text-small text-faint">
                    ยังไม่มีคอมเมนต์ — ตอบหรือถามเพิ่มได้ด้านล่าง
                </p>

                <ul v-else class="flex flex-col gap-2.5">
                    <li
                        v-for="comment in ownComments"
                        :key="comment.id"
                        class="rounded-control bg-ground px-3 py-2"
                    >
                        <div class="flex flex-wrap items-baseline gap-x-2 text-tiny">
                            <span class="font-semibold text-ink">{{ comment.author }}</span>
                            <span class="text-faint">{{ toThaiDateTime(comment.createdAt) }}</span>
                        </div>
                        <p class="mt-0.5 whitespace-pre-line text-body text-ink">{{ comment.message }}</p>
                    </li>
                </ul>

                <form class="mt-4 flex flex-col gap-2" @submit.prevent="submit">
                    <UiInput
                        v-model="commentAuthor"
                        label="ชื่อผู้คอมเมนต์"
                        required
                        placeholder="พิมพ์ชื่อของคุณ"
                        autocomplete="off"
                        :error="authorError"
                    />
                    <UiTextarea
                        v-model="message"
                        :rows="3"
                        :maxlength="TRACKING_LIMITS.message"
                        placeholder="ตอบคำถาม หรือถามเพิ่ม"
                        :error="messageError"
                    />
                    <div class="flex justify-end">
                        <UiButton type="submit" size="sm" :icon="Send" :loading="sending">
                            ส่งคอมเมนต์
                        </UiButton>
                    </div>
                </form>
            </section>
        </div>

        <template #footer>
            <UiButton variant="outline" @click="open = false">ปิด</UiButton>
        </template>
    </UiModal>
</template>
