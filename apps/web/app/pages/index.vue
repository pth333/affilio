<script setup lang="ts">
import { apiErrorMessage, api } from '~/composables/useApi';
import { STATUS_LABEL, VIDEO_STATUSES, type Page, type Product, type VideoListItem, type VideoStatus } from '~/types';

const BUSY: readonly VideoStatus[] = ['queued', 'drafting', 'auto_check', 'previewing', 'revising', 'rendering'];

const status = ref<VideoStatus | ''>('pending_review');
const items = ref<VideoListItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref('');

async function load(reset = true): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const page = await api<Page<VideoListItem>>('/videos', {
      query: { status: status.value || undefined, cursor: reset ? undefined : (cursor.value ?? undefined), limit: 30 },
    });
    items.value = reset ? page.items : [...items.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

// Sản phẩm + tạo video
const products = ref<Product[]>([]);
const form = reactive({ name: '', affiliateUrl: '', description: '' });
const productId = ref('');
const busy = ref(false);

async function loadProducts(): Promise<void> {
  try {
    products.value = (await api<Page<Product>>('/products', { query: { limit: 100 } })).items;
    if (!productId.value) productId.value = products.value[0]?.id ?? '';
  } catch (err) {
    error.value = apiErrorMessage(err);
  }
}

async function addProduct(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const p = await api<Product>('/products', { method: 'POST', body: { ...form, description: form.description || undefined } });
    Object.assign(form, { name: '', affiliateUrl: '', description: '' });
    await loadProducts();
    productId.value = p.id;
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function createVideo(): Promise<void> {
  if (!productId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api('/videos', { method: 'POST', body: { productId: productId.value } });
    status.value = '';
  } catch (err) {
    error.value = apiErrorMessage(err);
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
    if (!loading.value && items.value.some((v) => BUSY.includes(v.status))) void load();
  }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));

function fmt(ts: string): string {
  return new Date(ts).toLocaleString('vi-VN');
}
</script>

<template>
  <section class="panel">
    <h3 class="mb-3 text-base font-semibold">Tạo video</h3>
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="addProduct">
      <input v-model="form.name" class="field" placeholder="Tên sản phẩm" required maxlength="200" />
      <input v-model="form.affiliateUrl" class="field min-w-50 flex-1" type="url" placeholder="Link affiliate" required />
      <input v-model="form.description" class="field min-w-50 flex-1" placeholder="Mô tả (tuỳ chọn)" />
      <button class="btn" :disabled="busy">Thêm sản phẩm</button>
    </form>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <select v-model="productId" class="field" :disabled="products.length === 0">
        <option v-if="products.length === 0" value="">Chưa có sản phẩm</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button class="btn btn-primary" :disabled="busy || !productId" @click="createVideo">Tạo video nháp</button>
    </div>
  </section>

  <section class="panel">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-base font-semibold">Video</h3>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="status" class="field">
          <option value="">Tất cả</option>
          <option v-for="s in VIDEO_STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
        </select>
        <button class="btn" :disabled="loading" @click="load()">Làm mới</button>
      </div>
    </div>
    <p v-if="error" class="mb-2 text-bad">{{ error }}</p>
    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-line text-xs text-muted">
          <th class="p-2 font-medium">Sản phẩm</th>
          <th class="p-2 font-medium">Trạng thái</th>
          <th class="hidden p-2 font-medium sm:table-cell">Cập nhật</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in items" :key="v.id" class="border-b border-line align-top">
          <td class="p-2">
            <NuxtLink :to="`/videos/${v.id}`" class="hover:underline">{{ v.productName }}</NuxtLink>
            <div class="text-xs text-muted">{{ v.id }}</div>
            <div v-if="v.failedReason" class="text-xs text-bad">{{ v.failedReason }}</div>
          </td>
          <td class="p-2"><StatusBadge :status="v.status" /></td>
          <td class="hidden p-2 text-muted sm:table-cell">{{ fmt(v.updatedAt) }}</td>
        </tr>
        <tr v-if="!loading && items.length === 0">
          <td colspan="3" class="p-2 text-muted">Không có video nào.</td>
        </tr>
      </tbody>
    </table>
    <div v-if="cursor" class="mt-2">
      <button class="btn" :disabled="loading" @click="load(false)">Xem thêm</button>
    </div>
  </section>
</template>
