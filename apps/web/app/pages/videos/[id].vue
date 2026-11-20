<script setup lang="ts">
import { apiErrorMessage, api } from '~/composables/useApi';
import { type ReviewDecision, type VideoDetail } from '~/types';

const route = useRoute();
const id = computed(() => String(route.params.id));

const data = ref<VideoDetail | null>(null);
const error = ref('');
const busy = ref(false);
const noteText = reactive<Record<string, string>>({});

async function load(): Promise<void> {
  error.value = '';
  try {
    data.value = await api<VideoDetail>(`/videos/${encodeURIComponent(id.value)}`);
  } catch (err) {
    error.value = apiErrorMessage(err);
  }
}

const canReview = computed(() => data.value?.video.status === 'pending_review' && Boolean(data.value.version));

async function decide(decision: ReviewDecision): Promise<void> {
  const version = data.value?.version;
  if (!canReview.value || !version || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    // Gửi kèm versionId: server từ chối nếu đã có bản mới hơn (tránh duyệt nhầm bản cũ).
    await api(`/videos/${encodeURIComponent(id.value)}/review`, { method: 'POST', body: { versionId: version.id, decision } });
    await load();
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function addNote(sceneId: string): Promise<void> {
  const version = data.value?.version;
  const text = noteText[sceneId]?.trim();
  if (!version || !text) return;
  busy.value = true;
  error.value = '';
  try {
    await api(`/videos/${encodeURIComponent(id.value)}/notes`, { method: 'POST', body: { versionId: version.id, sceneId, text } });
    noteText[sceneId] = '';
    await load();
  } catch (err) {
    error.value = apiErrorMessage(err);
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
  <p class="mb-3"><NuxtLink to="/" class="hover:underline">← Hộp duyệt</NuxtLink></p>
  <p v-if="error" class="mb-3 text-bad">{{ error }}</p>

  <template v-if="data">
    <section class="panel">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-xl font-semibold">{{ data.product.name }}</h2>
          <div class="text-muted">{{ data.video.id }} · phiên bản {{ data.version?.versionNo ?? '—' }}</div>
        </div>
        <StatusBadge :status="data.video.status" />
      </div>
      <p v-if="data.video.failedReason" class="mt-2 text-bad">Lỗi ở bước {{ data.video.failedStep }}: {{ data.video.failedReason }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button class="btn btn-ok" :disabled="!canReview || busy" @click="decide('approve')">Duyệt <kbd class="kbd">A</kbd></button>
        <button class="btn btn-warn" :disabled="!canReview || busy" @click="decide('needs_changes')">Cần sửa <kbd class="kbd">N</kbd></button>
        <button class="btn btn-bad" :disabled="!canReview || busy" @click="decide('reject')">Từ chối <kbd class="kbd">R</kbd></button>
        <span class="text-muted">Preview video sẽ có ở M1 (render FFmpeg).</span>
      </div>
    </section>

    <section v-if="data.check" class="panel">
      <h3 class="mb-2 text-base font-semibold">
        Kiểm tra tự động: <span :class="data.check.passed ? '' : 'text-bad'">{{ data.check.passed ? 'đạt' : 'không đạt' }}</span>
      </h3>
      <ul class="list-none space-y-0.5">
        <li v-for="r in data.check.rules" :key="r.rule" :class="r.passed ? 'text-muted' : 'text-bad'">
          {{ r.passed ? '✓' : '✗' }} {{ r.rule }}<span v-if="r.message"> — {{ r.message }}</span>
        </li>
      </ul>
    </section>

    <section v-if="data.version" class="panel">
      <h3 class="mb-1 text-base font-semibold">Kịch bản</h3>
      <div v-for="scene in data.version.spec.scenes" :key="scene.id" class="border-t border-line py-3 first-of-type:border-t-0">
        <div class="flex flex-wrap items-center gap-2">
          <strong>{{ scene.id }}</strong>
          <span class="badge">{{ scene.role }}</span>
          <span class="text-muted">{{ scene.visual.type }} · {{ scene.visual.motion }}</span>
        </div>
        <p class="my-1.5">{{ scene.narration }}</p>
        <p v-if="scene.visual.prompt" class="mb-1.5 text-xs text-muted">Prompt ảnh: {{ scene.visual.prompt }}</p>
        <ul v-if="data.notes.some((n) => n.sceneId === scene.id)" class="mb-1.5 list-disc pl-5">
          <li v-for="n in data.notes.filter((x) => x.sceneId === scene.id)" :key="n.id">{{ n.text }} <span class="text-muted">({{ n.status }})</span></li>
        </ul>
        <form class="flex items-center gap-2" @submit.prevent="addNote(scene.id)">
          <input v-model="noteText[scene.id]" class="field flex-1" placeholder="Ghi chú cho cảnh này" maxlength="2000" />
          <button class="btn" :disabled="busy || !noteText[scene.id]?.trim()">Ghi chú</button>
        </form>
      </div>
    </section>
    <p v-else class="panel text-muted">Video chưa có phiên bản — worker đang xử lý.</p>
  </template>
</template>
