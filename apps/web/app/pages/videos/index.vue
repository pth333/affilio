<script setup lang="ts">
// Danh sách video từ API thật (/api/videos). Lỗi request đã được http interceptor báo bằng message.error.
import { STATUS_LABEL, VIDEO_STATUSES, type Page, type Product, type VideoListItem, type VideoStatus } from '~/types';

definePageMeta({ title: 'Video' });

const BUSY: readonly VideoStatus[] = ['queued', 'drafting', 'auto_check', 'previewing', 'revising', 'rendering'];

const status = ref<VideoStatus | ''>('pending_review');
const items = ref<VideoListItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);

async function load(reset = true, silent = false): Promise<void> {
  loading.value = true;
  try {
    const page = await http.get<Page<VideoListItem>>('/videos', {
      params: { status: status.value || undefined, cursor: reset ? undefined : (cursor.value ?? undefined), limit: 30 },
      silent,
    });
    items.value = reset ? page.items : [...items.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (err) {
    // Đã báo lỗi qua interceptor; giữ nguyên danh sách hiện tại.
    if (silent) console.warn('[videos] làm mới ngầm thất bại', err);
  } finally {
    loading.value = false;
  }
}

// ── Sản phẩm + tạo video
const products = ref<Product[]>([]);
const form = reactive({ name: '', affiliateUrl: '', description: '' });
const productId = ref('');
const busy = ref(false);

async function loadProducts(): Promise<void> {
  try {
    products.value = (await http.get<Page<Product>>('/products', { params: { limit: 100 } })).items;
    if (!productId.value) productId.value = products.value[0]?.id ?? '';
  } catch {
    products.value = [];
  }
}

async function addProduct(): Promise<void> {
  busy.value = true;
  try {
    const p = await http.post<Product>('/products', { ...form, description: form.description || undefined });
    Object.assign(form, { name: '', affiliateUrl: '', description: '' });
    await loadProducts();
    productId.value = p.id;
    message.success('Đã thêm sản phẩm vào thư viện');
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    busy.value = false;
  }
}

async function createVideo(): Promise<void> {
  if (!productId.value) return;
  busy.value = true;
  try {
    await http.post('/videos', { productId: productId.value });
    message.success('Đã tạo video nháp. AI đang viết kịch bản.');
    if (status.value === '') await load();
    else status.value = '';
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    busy.value = false;
  }
}

watch(status, () => load());

// Tự làm mới khi còn video đang xử lý.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void Promise.all([load(), loadProducts()]);
  timer = setInterval(() => {
    if (!loading.value && items.value.some((v) => BUSY.includes(v.status))) void load(true, true);
  }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <PageHeader eyebrow="Dữ liệu thật từ API" title="Video" description="Thêm sản phẩm, tạo video nháp và theo dõi trạng thái xử lý." />

  <section class="card mb-5 p-5">
    <h2 class="mb-4 text-[1.1rem] font-semibold">Tạo video</h2>
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="addProduct">
      <input v-model="form.name" class="field" placeholder="Tên sản phẩm" required maxlength="200" />
      <input v-model="form.affiliateUrl" class="field min-w-50 flex-1" type="url" placeholder="Link affiliate" required />
      <input v-model="form.description" class="field min-w-50 flex-1" placeholder="Mô tả (tuỳ chọn)" />
      <button class="btn" :disabled="busy"><AppIcon name="plus" :size="16" /> Thêm sản phẩm</button>
    </form>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <select v-model="productId" class="field" :disabled="products.length === 0">
        <option v-if="products.length === 0" value="">Chưa có sản phẩm</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button class="btn btn-primary" :disabled="busy || !productId" @click="createVideo">
        <AppIcon name="sparkles" :size="16" /> Tạo video nháp
      </button>
    </div>
  </section>

  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
      <h2 class="text-[1.1rem] font-semibold">Danh sách video</h2>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="status" class="field h-9">
          <option value="">Tất cả trạng thái</option>
          <option v-for="s in VIDEO_STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
        </select>
        <button class="btn btn-sm h-9" :disabled="loading" @click="load()"><AppIcon name="rotate-ccw" :size="15" /> Làm mới</button>
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
              <NuxtLink :to="`/videos/${v.id}`" class="font-medium hover:text-primary">{{ v.productName }}</NuxtLink>
              <div class="text-[0.8rem] text-muted">{{ v.id }}</div>
              <div v-if="v.failedReason" class="text-[0.85rem] text-bad">{{ v.failedReason }}</div>
            </td>
            <td class="px-5 py-3"><StatusBadge :status="v.status" /></td>
            <td class="hidden px-5 py-3 text-muted sm:table-cell">{{ formatDateTime(v.updatedAt) }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="3" class="px-5 py-10 text-center text-muted">Không có video nào.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="cursor" class="border-t border-line px-5 py-3">
      <button class="btn btn-sm" :disabled="loading" @click="load(false)">Xem thêm</button>
    </div>
  </section>
</template>
