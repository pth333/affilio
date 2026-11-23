<script setup lang="ts">
// Hộp thư duyệt: video do worker xử lý xong (pending_review) xuất hiện ở đây.
// Trang chỉ điều phối; state dùng chung nằm ở stores/review.ts, giao diện tách thành các component review/*.
import { storeToRefs } from 'pinia';
import { useReviewStore } from '~/stores/review';
import { STATUS_LABEL, type ReviewDecision } from '~/types';

definePageMeta({ title: 'Hộp thư duyệt' });

const route = useRoute();
const router = useRouter();
const store = useReviewStore();
const {
  pendingVideos,
  pendingCount,
  detail,
  selectedId,
  loadingInbox,
  loadingDetail,
  busy,
  canReview,
  status,
  scenes,
} = storeToRefs(store);

const statusLabel = computed(() => (status.value ? STATUS_LABEL[status.value] : ''));
const productName = computed(() => detail.value?.product.name ?? '');
const versionNo = computed(() => detail.value?.version?.versionNo ?? null);
const totalSeconds = computed(() => scenes.value.reduce((sum, scene) => sum + estimateSceneSeconds(scene), 0));

/** Đồng bộ video đang chọn lên URL để mở lại/đọc link là thấy đúng video. */
function syncQuery(id: string): void {
  const current = typeof route.query.video === 'string' ? route.query.video : '';
  if (current === id) return;
  const query = { ...route.query };
  if (id) query.video = id;
  else delete query.video;
  void router.replace({ query });
}

/** Chọn video chỉ đổi URL; watcher `route.query.video` bên dưới là nơi duy nhất nạp chi tiết. */
function selectVideo(id: string): void {
  if (id === store.selectedId) return;
  const query = { ...route.query, video: id };
  void router.replace({ query });
}

function focusScene(sceneId: string): void {
  document.getElementById(`scene-${sceneId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function decide(decision: ReviewDecision): Promise<void> {
  await store.submitDecision(decision);
}

/** Tự làm mới danh sách + chi tiết để bắt video vừa xử lý xong quay lại hộp thư. */
function pollInbox(): void {
  if (document.hidden) return;
  void store.refreshInbox();
  if (store.selectedId) void store.loadDetail(store.selectedId);
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  await store.refreshInbox();
  const hasQuery = typeof route.query.video === 'string' && route.query.video.length > 0;
  if (!hasQuery && store.pendingVideos[0]) selectVideo(store.pendingVideos[0].id);
  timer = setInterval(pollInbox, 6000);
});
onBeforeUnmount(() => clearInterval(timer));

// Store tự đổi video (vd. sau khi duyệt) thì đồng bộ ngược lên URL.
watch(selectedId, (id) => syncQuery(id));

// URL là nguồn duy nhất cho việc chọn video: chạy cả lần đầu mở trang và mỗi lần query đổi.
watch(
  () => route.query.video,
  (value) => {
    const id = typeof value === 'string' ? value : '';
    if (id && id !== store.selectedId) void store.selectVideo(id);
  },
  { immediate: true },
);
</script>

<template>
  <PageHeader
    title="Hộp thư duyệt"
    :description="`${pendingCount} video chờ duyệt. Xem timeline, sửa từng cảnh rồi duyệt khi đã ưng ý.`"
  >
    <template #actions>
      <button class="btn" :disabled="loadingInbox" @click="store.refreshInbox()">
        <AppIcon name="rotate-ccw" :size="16" :class="loadingInbox ? 'animate-spin' : ''" /> Làm mới
      </button>
      <NuxtLink to="/videos" class="btn"><AppIcon name="film" :size="16" /> Danh sách video</NuxtLink>
    </template>
  </PageHeader>

  <ReviewEmptyState v-if="!selectedId && !detail" />

  <div v-else class="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
    <ReviewInboxList
      :videos="pendingVideos"
      :selected-id="selectedId"
      :count="pendingCount"
      :loading="loadingInbox"
      @select="selectVideo"
    />

    <section v-if="detail" class="card p-5">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <h2 class="text-[1.15rem] font-bold">{{ productName }}</h2>
        <StatusBadge v-if="status" :status="status" />
        <span class="badge bg-hover text-muted">v{{ versionNo ?? '—' }}</span>
        <span class="badge bg-hover text-muted">{{ scenes.length }} cảnh · {{ formatTimecode(totalSeconds) }}</span>
      </div>

      <p v-if="store.isProcessing" class="mb-4 flex items-center gap-2 rounded-lg bg-warn-soft px-4 py-3 text-[0.9rem] text-warn">
        <AppIcon name="rotate-ccw" :size="16" class="animate-spin" />
        Worker đang xử lý ({{ statusLabel }}). Video sẽ tự quay lại hộp thư khi xong — trang tự cập nhật.
      </p>
      <p v-else-if="!canReview" class="mb-4 rounded-lg bg-hover px-4 py-3 text-[0.9rem] text-muted">
        Video đang ở trạng thái “{{ statusLabel }}” nên chỉ xem được, không sửa hay duyệt.
      </p>

      <div class="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ReviewVideoPreview :product-name="productName" :scenes="scenes" />
        <SceneTimeline :scenes="scenes" @focus="focusScene" />
      </div>

      <SceneEditorList
        :version-id="detail.version?.id ?? ''"
        :scenes="scenes"
        :can-review="canReview"
        :busy="busy"
      />
    </section>

    <aside v-if="detail" class="flex flex-col gap-5">
      <ReviewCheckPanel :check="detail.check" :notes="detail.notes" :reviews="detail.reviews" />
      <ReviewDecisionPanel :can-review="canReview" :busy="busy" @approve="decide('approve')" @reject="decide('reject')" />
    </aside>

    <p v-if="!detail && selectedId" class="card p-5 text-muted">
      <AppIcon v-if="loadingDetail" name="rotate-ccw" :size="16" class="mr-2 inline animate-spin" />
      {{ loadingDetail ? 'Đang tải video…' : 'Không tải được video này. Thử làm mới hoặc chọn video khác.' }}
    </p>
  </div>
</template>
