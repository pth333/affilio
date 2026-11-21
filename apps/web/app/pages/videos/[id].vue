<script setup lang="ts">
// Duyệt một video từ API thật. Lỗi request đã được http interceptor báo bằng message.error.
import type { ReviewDecision, VideoDetail } from '~/types';

definePageMeta({ title: 'Chi tiết video' });

const DECISION_MESSAGE: Record<ReviewDecision, string> = {
  approve: 'Đã duyệt video. Video đã được chuyển sang mục Đăng tải.',
  reject: 'Đã từ chối bản nháp.',
  needs_changes: 'Đã gửi yêu cầu chỉnh sửa cho AI.',
};

const route = useRoute();
const id = computed(() => String(route.params.id));

const data = ref<VideoDetail | null>(null);
const busy = ref(false);
const noteText = reactive<Record<string, string>>({});

async function load(): Promise<void> {
  try {
    data.value = await videoApi.detail(id.value);
  } catch {
    data.value = null;
  }
}

const canReview = computed(() => data.value?.video.status === 'pending_review' && Boolean(data.value.version));

async function decide(decision: ReviewDecision): Promise<void> {
  const version = data.value?.version;
  if (!canReview.value || !version || busy.value) return;
  busy.value = true;
  try {
    await videoApi.review(id.value, { versionId: version.id, decision });
    message.success(DECISION_MESSAGE[decision]);
    await load();
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    busy.value = false;
  }
}

async function addNote(sceneId: string): Promise<void> {
  const version = data.value?.version;
  const text = noteText[sceneId]?.trim();
  if (!version || !text) return;
  busy.value = true;
  try {
    await videoApi.addNote(id.value, { versionId: version.id, sceneId, text });
    noteText[sceneId] = '';
    message.success('AI đã nhận ghi chú và đang chỉnh sửa bản nháp.');
    await load();
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    busy.value = false;
  }
}

/** Phím tắt: A duyệt, R từ chối, N cần sửa (bỏ qua khi đang gõ). */
function onKey(e: KeyboardEvent): void {
  const target = e.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
  const map: Record<string, ReviewDecision> = { a: 'approve', r: 'reject', n: 'needs_changes' };
  const decision = map[e.key.toLowerCase()];
  if (decision) void decide(decision);
}

onMounted(() => {
  void load();
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
watch(id, () => load());
</script>

<template>
  <NuxtLink to="/videos" class="mb-4 inline-flex items-center gap-1 text-muted hover:text-fg">
    <AppIcon name="chevron-left" :size="16" /> Danh sách video
  </NuxtLink>

  <template v-if="data">
    <section class="card mb-5 p-5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 class="text-[1.5rem] font-bold tracking-[-0.02em]">{{ data.product.name }}</h1>
          <div class="text-muted">{{ data.video.id }} · phiên bản {{ data.version?.versionNo ?? '—' }}</div>
        </div>
        <StatusBadge :status="data.video.status" />
      </div>
      <p v-if="data.video.failedReason" class="mt-2 text-bad">Lỗi ở bước {{ data.video.failedStep }}: {{ data.video.failedReason }}</p>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn btn-ok" :disabled="!canReview || busy" @click="decide('approve')">
          <AppIcon name="check" :size="16" /> Duyệt <kbd class="kbd">A</kbd>
        </button>
        <button class="btn btn-warn" :disabled="!canReview || busy" @click="decide('needs_changes')">
          <AppIcon name="message-square" :size="16" /> Cần sửa <kbd class="kbd">N</kbd>
        </button>
        <button class="btn btn-bad" :disabled="!canReview || busy" @click="decide('reject')">
          <AppIcon name="x" :size="16" /> Từ chối <kbd class="kbd">R</kbd>
        </button>
        <span class="text-muted">Preview video sẽ có ở M1 (render FFmpeg).</span>
      </div>
    </section>

    <section v-if="data.check" class="card mb-5 p-5">
      <h2 class="mb-3 text-[1.1rem] font-semibold">
        Kiểm tra tự động:
        <span :class="data.check.passed ? 'text-ok' : 'text-bad'">{{ data.check.passed ? 'đạt' : 'không đạt' }}</span>
      </h2>
      <ul class="space-y-1.5">
        <li v-for="r in data.check.rules" :key="r.rule" class="flex items-start gap-2" :class="r.passed ? 'text-muted' : 'text-bad'">
          <AppIcon :name="r.passed ? 'circle-check' : 'circle-x'" :size="17" class="mt-0.5" :class="r.passed ? 'text-ok' : ''" />
          <span>{{ r.rule }}<span v-if="r.message"> — {{ r.message }}</span></span>
        </li>
      </ul>
    </section>

    <section v-if="data.version" class="card p-5">
      <h2 class="mb-1 text-[1.1rem] font-semibold">Kịch bản</h2>
      <div v-for="scene in data.version.spec.scenes" :key="scene.id" class="border-t border-line py-4 first-of-type:border-t-0">
        <div class="flex flex-wrap items-center gap-2">
          <strong>{{ scene.id }}</strong>
          <span class="badge bg-primary-soft text-primary-strong">{{ scene.role }}</span>
          <span class="text-muted">{{ scene.visual.type }} · {{ scene.visual.motion }}</span>
        </div>
        <p class="my-2">{{ scene.narration }}</p>
        <p v-if="scene.visual.prompt" class="mb-2 text-[0.85rem] text-muted">Prompt ảnh: {{ scene.visual.prompt }}</p>
        <ul v-if="data.notes.some((n) => n.sceneId === scene.id)" class="mb-2 list-disc pl-5">
          <li v-for="n in data.notes.filter((x) => x.sceneId === scene.id)" :key="n.id">
            {{ n.text }} <span class="text-muted">({{ n.status }})</span>
          </li>
        </ul>
        <form class="flex items-center gap-2" @submit.prevent="addNote(scene.id)">
          <input v-model="noteText[scene.id]" class="field flex-1" placeholder="Ghi chú cho cảnh này" maxlength="2000" />
          <button class="btn" :disabled="busy || !noteText[scene.id]?.trim()">Ghi chú</button>
        </form>
      </div>
    </section>
    <p v-else class="card p-5 text-muted">Video chưa có phiên bản — worker đang xử lý.</p>
  </template>
</template>
