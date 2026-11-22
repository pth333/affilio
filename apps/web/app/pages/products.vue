<script setup lang="ts">
import type { LibraryProduct } from '~/types';

definePageMeta({ title: 'Sản phẩm' });

const { products } = useProductLibrary();
const keyword = ref('');
const category = ref('');
const showCreateDialog = ref(false);

const categories = computed(() => [...new Set(products.value.map((product) => product.category))]);
const clipTotal = computed(() => products.value.reduce((total, product) => total + (product.clips?.length ?? 0), 0));
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return products.value.filter(
    (product) =>
      (!category.value || product.category === category.value) &&
      (!query || `${product.name} ${product.brand}`.toLowerCase().includes(query)),
  );
});

async function copyAffiliateLink(product: Pick<LibraryProduct, 'affiliateUrl'>): Promise<void> {
  if (await copyToClipboard(product.affiliateUrl)) message.success('Đã sao chép vào bộ nhớ tạm');
  else message.error('Trình duyệt chưa cho phép sao chép. Hãy sao chép thủ công.');
}

/** Sản phẩm mới luôn nằm đầu thư viện: bỏ lọc để người dùng thấy ngay. */
function handleProductCreated(): void {
  keyword.value = '';
  category.value = '';
}
</script>

<template>
  <PageHeader title="Thư viện sản phẩm" description="Sản phẩm bạn muốn quảng bá. AI dùng thông tin ở đây để viết kịch bản.">
    <template #actions>
      <button class="btn btn-primary" @click="showCreateDialog = true">
        <AppIcon name="plus" :size="17" /> Tạo sản phẩm
      </button>
    </template>
  </PageHeader>

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
      <table class="w-full min-w-[820px] border-collapse">
        <thead>
          <tr class="table-head border-b border-line">
            <th class="px-5 py-3">Sản phẩm</th>
            <th class="px-5 py-3">Danh mục</th>
            <th class="px-5 py-3">Giá</th>
            <th class="px-5 py-3">Link affiliate</th>
            <th class="px-5 py-3">Clip của tôi</th>
            <th class="w-12 px-5 py-3"><span class="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filtered" :key="p.id" class="border-b border-line last:border-b-0 hover:bg-hover">
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <ProductThumb :name="p.name" :color="p.color" :image-url="p.imageUrl ?? null" :size="44" />
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
              <span v-if="(p.clips?.length ?? 0) > 0" class="badge bg-ok-soft text-ok">
                <AppIcon name="film" :size="13" /> {{ p.clips?.length }} clip
              </span>
              <span v-else-if="p.hasClip" class="badge bg-ok-soft text-ok"><AppIcon name="check" :size="13" /> Đã có clip</span>
              <span v-else class="badge bg-hover text-muted">Chưa có</span>
            </td>
            <td class="px-5 py-3.5">
              <button class="icon-btn" :aria-label="`Sửa ${p.name}`" @click="message.info('Chỉnh sửa sản phẩm sẽ sớm khả dụng.')">
                <AppIcon name="pencil" :size="16" />
              </button>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="px-5 py-12">
              <div class="flex flex-col items-center gap-3 text-center">
                <span class="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <AppIcon name="package" :size="26" />
                </span>
                <div>
                  <p class="font-semibold">Không tìm thấy sản phẩm phù hợp</p>
                  <p class="mt-1 text-[0.9rem] text-muted">Thử từ khoá khác hoặc thêm sản phẩm mới vào thư viện.</p>
                </div>
                <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
                  <AppIcon name="plus" :size="15" /> Tạo sản phẩm
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <p class="mt-5 flex items-start gap-2 rounded-lg bg-primary-soft/60 p-4 text-[0.92rem]">
    <AppIcon name="info" :size="18" class="mt-0.5 text-primary" />
    <span>
      <strong>Clip thật tạo nên sự khác biệt.</strong> Video có cảnh quay thật của bạn thường có tỉ lệ xem hết cao hơn video chỉ dùng ảnh.
      <span v-if="clipTotal > 0" class="text-muted"> Thư viện đang có {{ clipTotal }} clip.</span>
    </span>
  </p>

  <CreateProductDialog :open="showCreateDialog" @close="showCreateDialog = false" @created="handleProductCreated" />
</template>
