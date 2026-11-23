<script setup lang="ts">
// Thư viện sản phẩm: tìm/lọc ở client, bảng dùng UTable (Nuxt UI) với giao diện chung TABLE_UI.
import type { TableColumn } from '@nuxt/ui';
import type { LibraryProduct } from '~/types';

definePageMeta({ title: 'Sản phẩm' });

const { products } = useProductLibrary();
const keyword = ref('');
const category = ref('');
const showCreateDialog = ref(false);

const columns: TableColumn<LibraryProduct>[] = [
  { accessorKey: 'name', header: 'Sản phẩm' },
  { accessorKey: 'category', header: 'Danh mục', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'price', header: 'Giá', meta: { class: { td: 'font-medium tabular-nums' } } },
  { id: 'affiliateUrl', header: 'Link affiliate' },
  { id: 'clips', header: 'Clip của tôi', meta: { class: { th: 'w-36', td: 'w-36' } } },
  { id: 'actions', header: '', meta: { class: { th: 'w-12', td: 'w-12' } } },
];

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

    <UTable
      :data="filtered"
      :columns="columns"
      :ui="{ ...TABLE_UI, base: 'w-full min-w-[820px] border-collapse' }"
      :meta="{ class: { tr: 'hover:bg-hover' } }"
    >
      <template #name-cell="{ row }">
        <div class="flex items-center gap-3">
          <ProductThumb :name="row.original.name" :color="row.original.color" :image-url="row.original.imageUrl ?? null" :size="44" />
          <div class="min-w-0">
            <p class="font-medium">{{ row.original.name }}</p>
            <p class="text-[0.85rem] text-muted">{{ row.original.brand }}</p>
          </div>
        </div>
      </template>

      <template #price-cell="{ row }">
        {{ formatCurrency(row.original.price) }}
      </template>

      <template #affiliateUrl-cell="{ row }">
        <button class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" @click="copyAffiliateLink(row.original)">
          <AppIcon name="link" :size="15" /> Sao chép link
        </button>
      </template>

      <template #clips-cell="{ row }">
        <span v-if="(row.original.clips?.length ?? 0) > 0" class="badge bg-ok-soft text-ok">
          <AppIcon name="film" :size="13" /> {{ row.original.clips?.length }} clip
        </span>
        <span v-else-if="row.original.hasClip" class="badge bg-ok-soft text-ok">
          <AppIcon name="check" :size="13" /> Đã có clip
        </span>
        <span v-else class="badge bg-hover text-muted">Chưa có</span>
      </template>

      <template #actions-header><span class="sr-only">Thao tác</span></template>
      <template #actions-cell="{ row }">
        <button class="icon-btn" :aria-label="`Sửa ${row.original.name}`" @click="message.info('Chỉnh sửa sản phẩm sẽ sớm khả dụng.')">
          <AppIcon name="pencil" :size="16" />
        </button>
      </template>

      <template #empty>
        <div class="flex flex-col items-center gap-3 text-center">
          <span class="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <AppIcon name="package" :size="26" />
          </span>
          <div>
            <p class="font-semibold text-fg">Không tìm thấy sản phẩm phù hợp</p>
            <p class="mt-1 text-[0.9rem] text-muted">Thử từ khoá khác hoặc thêm sản phẩm mới vào thư viện.</p>
          </div>
          <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
            <AppIcon name="plus" :size="15" /> Tạo sản phẩm
          </button>
        </div>
      </template>
    </UTable>
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
