<script setup lang="ts">
// Danh sách video từ API thật (/api/videos). Video mới được tạo từ popup chọn kênh + sản phẩm + định dạng.
// Lỗi request đã được http interceptor báo bằng message.error.
import { STATUS_LABEL, VIDEO_STATUSES, type VideoListItem, type VideoStatus } from '~/types';

definePageMeta({ title: 'Video' });

const BUSY: readonly VideoStatus[] = ['queued', 'drafting', 'auto_check', 'previewing', 'revising', 'rendering'];

const status = ref<VideoStatus | ''>('pending_review');
const items = ref<VideoListItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const showCreateDialog = ref(false);

async function loadVideos(reset = true, silent = false): Promise<void> {
  loading.value = true;
  try {
    const page = await videoApi.getVideos(
      { status: status.value || undefined, cursor: reset ? undefined : (cursor.value ?? undefined), limit: 30 },
      { silent },
    );
    items.value = reset ? page.items : [...items.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (err) {
    // Đã báo lỗi qua interceptor; giữ nguyên danh sách hiện tại.
    if (silent) console.warn('[videos] làm mới ngầm thất bại', err);
  } finally {
    loading.value = false;
  }
}

/** Video nháp mới đang ở trạng thái "chờ xử lý": bỏ lọc để người dùng thấy ngay kết quả. */
function handleVideoCreated(): void {
  if (status.value === '') void loadVideos();
  else status.value = '';
}

watch(status, () => loadVideos());

// Tự làm mới khi còn video đang xử lý.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void loadVideos();
  timer = setInterval(() => {
    if (!loading.value && items.value.some((v) => BUSY.includes(v.status))) void loadVideos(true, true);
  }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <PageHeader
    eyebrow="Dữ liệu thật từ API"
    title="Video"
    description="Tạo video nháp từ thư viện sản phẩm và theo dõi trạng thái xử lý của từng bản."
  >
    <template #actions>
      <button class="btn btn-primary" @click="showCreateDialog = true">
        <AppIcon name="plus" :size="17" /> Tạo video
      </button>
    </template>
  </PageHeader>

  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
      <div>
        <h2 class="text-[1.1rem] font-semibold">Danh sách video</h2>
        <p class="text-[0.85rem] text-muted">Trang này tự làm mới khi còn video đang xử lý.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="status" class="field h-9">
          <option value="">Tất cả trạng thái</option>
          <option v-for="s in VIDEO_STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
        </select>
        <button class="btn btn-sm h-9" :disabled="loading" @click="loadVideos()">
          <AppIcon name="rotate-ccw" :size="15" /> Làm mới
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr class="table-head border-b border-line">
            <th class="px-5 py-3">Sản phẩm</th>
            <th class="px-5 py-3">Trạng thái</th>
            <th class="hidden px-5 py-3 sm:table-cell">Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in items" :key="v.id" class="border-b border-line align-top last:border-b-0 hover:bg-hover">
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <ProductThumb :name="v.productName" :color="pickAccentColor(v.productName)" :size="38" />
                <div class="min-w-0">
                  <NuxtLink :to="`/videos/${v.id}`" class="font-medium hover:text-primary">{{ v.productName }}</NuxtLink>
                  <div class="text-[0.8rem] text-muted">{{ v.id }}</div>
                  <div v-if="v.failedReason" class="text-[0.85rem] text-bad">{{ v.failedReason }}</div>
                </div>
              </div>
            </td>
            <td class="px-5 py-3"><StatusBadge :status="v.status" /></td>
            <td class="hidden px-5 py-3 text-muted sm:table-cell">{{ formatDateTime(v.updatedAt) }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="3" class="px-5 py-12">
              <div class="flex flex-col items-center gap-3 text-center">
                <span class="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <AppIcon name="film" :size="26" />
                </span>
                <div>
                  <p class="font-semibold">Chưa có video nào ở đây</p>
                  <p class="mt-1 text-[0.9rem] text-muted">Chọn sản phẩm và định dạng để AI viết những bản nháp đầu tiên.</p>
                </div>
                <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
                  <AppIcon name="sparkles" :size="15" /> Tạo video
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="cursor" class="border-t border-line px-5 py-3">
      <button class="btn btn-sm" :disabled="loading" @click="loadVideos(false)">Xem thêm</button>
    </div>
  </section>

  <CreateVideoDialog :open="showCreateDialog" @close="showCreateDialog = false" @created="handleVideoCreated" />
</template>
