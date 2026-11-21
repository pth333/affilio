<script setup lang="ts">
import { PRODUCTS } from '~/data/mock';
import type { LibraryProduct } from '~/types';

definePageMeta({ title: 'Sản phẩm' });

const products = ref<LibraryProduct[]>(PRODUCTS.map((p) => ({ ...p })));
const keyword = ref('');
const category = ref('');

const categories = computed(() => [...new Set(products.value.map((p) => p.category))]);
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return products.value.filter(
    (p) => (!category.value || p.category === category.value) && (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q)),
  );
});

async function copyAffiliateLink(product: LibraryProduct): Promise<void> {
  if (await copyToClipboard(product.affiliateUrl)) message.success('Đã sao chép vào bộ nhớ tạm');
  else message.error('Trình duyệt chưa cho phép sao chép. Hãy sao chép thủ công.');
}

// ── Thêm sản phẩm (mock): khi có API thay bằng productApi.createProduct(…) (api/product.ts)
const showForm = ref(false);
const form = reactive({ name: '', affiliateUrl: '', category: 'Công nghệ', price: 0 });

function addLibraryProduct(): void {
  products.value.unshift({
    id: `p-${Date.now()}`,
    name: form.name.trim(),
    brand: form.name.trim().split(' ').at(-1) ?? '',
    category: form.category,
    price: form.price,
    affiliateUrl: form.affiliateUrl,
    hasClip: false,
    color: '#7860e5',
  });
  Object.assign(form, { name: '', affiliateUrl: '', price: 0 });
  showForm.value = false;
  message.success('Đã thêm sản phẩm vào thư viện');
}
</script>

<template>
  <PageHeader title="Thư viện sản phẩm" description="Sản phẩm bạn muốn quảng bá. AI dùng thông tin ở đây để viết kịch bản.">
    <template #actions>
      <button class="btn btn-primary" @click="showForm = !showForm">
        <AppIcon :name="showForm ? 'x' : 'plus'" :size="17" /> {{ showForm ? 'Đóng' : 'Thêm sản phẩm' }}
      </button>
    </template>
  </PageHeader>

  <form v-if="showForm" class="card mb-5 grid gap-3 p-5 md:grid-cols-[2fr_2fr_1fr_1fr_auto]" @submit.prevent="addLibraryProduct">
    <input v-model="form.name" class="field" placeholder="Tên sản phẩm" required maxlength="200" />
    <input v-model="form.affiliateUrl" class="field" type="url" placeholder="Link affiliate" required />
    <select v-model="form.category" class="field">
      <option v-for="c in ['Công nghệ', 'Nhà cửa', 'Làm đẹp', 'Gia dụng']" :key="c">{{ c }}</option>
    </select>
    <input v-model.number="form.price" class="field" type="number" min="0" step="1000" placeholder="Giá bán" required />
    <button class="btn btn-primary">Lưu</button>
  </form>

  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
      <div class="relative min-w-60 flex-1">
        <AppIcon name="search" :size="17" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input v-model="keyword" class="field w-full pl-9" type="search" placeholder="Tìm theo tên sản phẩm, thương hiệu…" />
      </div>
      <select v-model="category" class="field" aria-label="Lọc danh mục">
        <option value="">Tất cả danh mục</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full min-w-[760px] border-collapse">
        <thead>
          <tr class="table-head border-b border-line">
            <th class="px-5 py-3">Sản phẩm</th>
            <th class="px-5 py-3">Danh mục</th>
            <th class="px-5 py-3">Giá bán</th>
            <th class="px-5 py-3">Link affiliate</th>
            <th class="px-5 py-3">Clip của tôi</th>
            <th class="w-12 px-5 py-3"><span class="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filtered" :key="p.id" class="border-b border-line last:border-b-0 hover:bg-hover">
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <ProductThumb :name="p.name" :color="p.color" />
                <div class="min-w-0">
                  <p class="font-medium">{{ p.name }}</p>
                  <p class="text-[0.85rem] text-muted">{{ p.brand }}</p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3.5 text-muted">{{ p.category }}</td>
            <td class="px-5 py-3.5 font-medium tabular-nums">{{ formatCurrency(p.price) }}</td>
            <td class="px-5 py-3.5">
              <button class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" @click="copyAffiliateLink(p)">
                <AppIcon name="link" :size="15" /> Sao chép link
              </button>
            </td>
            <td class="px-5 py-3.5">
              <span v-if="p.hasClip" class="badge bg-ok-soft text-ok"><AppIcon name="check" :size="13" /> Đã có clip</span>
              <span v-else class="badge bg-hover text-muted">Chưa có</span>
            </td>
            <td class="px-5 py-3.5">
              <button class="icon-btn" :aria-label="`Sửa ${p.name}`" @click="message.info('Chỉnh sửa sản phẩm sẽ sớm khả dụng.')">
                <AppIcon name="pencil" :size="16" />
              </button>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="px-5 py-10 text-center text-muted">Không tìm thấy sản phẩm phù hợp.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <p class="mt-5 flex items-start gap-2 rounded-lg bg-primary-soft/60 p-4 text-[0.92rem]">
    <AppIcon name="info" :size="18" class="mt-0.5 text-primary" />
    <span><strong>Clip thật tạo nên sự khác biệt.</strong> Video có cảnh quay thật của bạn thường có tỉ lệ xem hết cao hơn video chỉ dùng ảnh.</span>
  </p>
</template>
