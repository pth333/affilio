<script setup lang="ts">
// Danh sách cảnh cho phép sửa tay từng cảnh hoặc nhờ AI viết lại; thao tác đi qua store.
import { storeToRefs } from 'pinia';
import { useReviewStore } from '~/stores/review';
import type { Scene } from '~/types';

const props = defineProps<{ versionId: string; scenes: Scene[]; canReview: boolean; busy: boolean }>();

const store = useReviewStore();
const { savingSceneId, revisingSceneId } = storeToRefs(store);

const narrationDraft = ref<Record<string, string>>({});
const reviseInstruction = ref<Record<string, string>>({});
const openRevise = ref<Record<string, boolean>>({});

const items = computed(() => buildSceneTimeline(props.scenes));

/** Nạp lại bản nháp khi sang phiên bản mới; cùng phiên bản thì giữ nguyên chữ người dùng đang gõ. */
function resetDrafts(): void {
  const drafts: Record<string, string> = {};
  const opens: Record<string, boolean> = {};
  for (const scene of props.scenes) {
    drafts[scene.id] = scene.narration;
    opens[scene.id] = false;
  }
  narrationDraft.value = drafts;
  reviseInstruction.value = {};
  openRevise.value = opens;
}

watch(() => props.versionId, resetDrafts, { immediate: true });

function isDirty(scene: Scene): boolean {
  return (narrationDraft.value[scene.id] ?? '') !== scene.narration;
}

function canAskAi(scene: Scene): boolean {
  return props.canReview && scene.lock === null && !props.busy;
}

async function save(scene: Scene): Promise<void> {
  await store.saveScene(scene, narrationDraft.value[scene.id] ?? '');
}

async function revise(scene: Scene): Promise<void> {
  const ok = await store.reviseScene(scene, reviseInstruction.value[scene.id] ?? '');
  if (ok) openRevise.value[scene.id] = false;
}
</script>

<template>
  <ul class="mt-5 space-y-3">
    <li v-for="item in items" :id="`scene-${item.scene.id}`" :key="item.scene.id" class="rounded-xl border border-line p-3.5">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="badge bg-primary-soft text-primary-strong">
          {{ item.index + 1 }} · {{ SCENE_ROLE_LABEL[item.scene.role] ?? item.scene.role }}
        </span>
        <span v-if="item.scene.lock" class="badge bg-hover text-muted"><AppIcon name="lock" :size="12" /> Đã sửa tay</span>
        <span class="ml-auto text-[0.8rem] text-muted tabular-nums">
          {{ formatTimecode(item.start) }} – {{ formatTimecode(item.start + item.seconds) }}
        </span>
      </div>

      <textarea
        v-model="narrationDraft[item.scene.id]"
        rows="2"
        maxlength="400"
        class="field h-auto w-full py-2 leading-snug"
        :disabled="!canReview || busy"
      />

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button class="btn btn-sm btn-primary" :disabled="!canReview || busy || !isDirty(item.scene)" @click="save(item.scene)">
          <AppIcon
            :name="savingSceneId === item.scene.id ? 'rotate-ccw' : 'check'"
            :size="15"
            :class="savingSceneId === item.scene.id ? 'animate-spin' : ''"
          />
          Lưu cảnh
        </button>
        <button class="btn btn-sm" :disabled="!canAskAi(item.scene)" @click="openRevise[item.scene.id] = !openRevise[item.scene.id]">
          <AppIcon name="sparkles" :size="15" /> Nhờ AI sửa
        </button>
        <span v-if="item.scene.lock" class="text-[0.8rem] text-muted">Cảnh đã sửa tay nên AI không ghi đè.</span>
      </div>

      <div v-if="openRevise[item.scene.id]" class="mt-2 flex flex-wrap gap-2">
        <input
          v-model="reviseInstruction[item.scene.id]"
          class="field min-w-0 flex-1"
          maxlength="1000"
          placeholder="Ví dụ: ngắn hơn, nhấn mạnh giá 289K…"
        />
        <button class="btn btn-sm btn-primary" :disabled="busy" @click="revise(item.scene)">
          <AppIcon
            :name="revisingSceneId === item.scene.id ? 'rotate-ccw' : 'sparkles'"
            :size="15"
            :class="revisingSceneId === item.scene.id ? 'animate-spin' : ''"
          />
          Gửi AI
        </button>
      </div>
    </li>
  </ul>
</template>
