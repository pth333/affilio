<script setup lang="ts">
// Form giao AI viết kịch bản: chọn một hoặc nhiều sản phẩm + định dạng (template); mỗi sản phẩm một kịch bản.
// Gửi xong trả về ngay — AI viết ở nền, kết quả hiện ở trang Kịch bản. Dùng trong AiScriptDialog và tab
// "AI viết kịch bản mới" của CreateVideoDialog. Component được mount lại mỗi lần popup mở nên state tự reset.
import type { ScriptTemplate } from '~/types';

const emit = defineEmits<{ cancel: []; submitted: [number]; 'update:busy': [boolean] }>();

const { products, ensureApiProductId } = useProductLibrary();

/** Khớp giới hạn `productIds.max(20)` của API. */
const MAX_PRODUCTS = 20;

const templates = ref<ScriptTemplate[]>([]);
const templateId = ref('');
const loadingTemplates = ref(false);
const keyword = ref('');
const selectedIds = ref<string[]>([]);
const submitting = ref(false);

watch(submitting, (value) => emit('update:busy', value));

const template = computed(() => templates.value.find((item) => item.id === templateId.value) ?? null);
const selectedProducts = computed(() => products.value.filter((item) => selectedIds.value.includes(item.id)));
const reachedLimit = computed(() => selectedIds.value.length >= MAX_PRODUCTS);

const filteredProducts = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return products.value;
  return products.value.filter((item) => `${item.name} ${item.brand} ${item.category}`.toLowerCase().includes(query));
});

function toggleProduct(id: string): void {
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter((item) => item !== id);
  else if (!reachedLimit.value) selectedIds.value = [...selectedIds.value, id];
}

async function loadTemplates(): Promise<void> {
  loadingTemplates.value = true;
  try {
    const { items } = await templateApi.getTemplates();
    templates.value = items;
    templateId.value = items[0]?.id ?? '';
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    loadingTemplates.value = false;
  }
}

onMounted(() => void loadTemplates());

async function submit(): Promise<void> {
  if (selectedProducts.value.length === 0 || !template.value || submitting.value) return;
  submitting.value = true;
  try {
    // Sản phẩm thư viện chỉ có ở client: bảo đảm có id trên API trước khi giao AI.
    const productIds = await Promise.all(selectedProducts.value.map((item) => ensureApiProductId(item)));
    const { items } = await scriptApi.requestAi({ productIds, templateId: template.value.id });
    const started = items.filter((item) => item.workflowId !== null).length;
    if (started < items.length) {
      message.warning(
        `Đã giao ${started}/${items.length} kịch bản; số còn lại lỗi khi khởi chạy — bấm “AI viết lại” ở mục Kịch bản.`,
      );
    } else {
      message.success(`AI đang viết ${items.length} kịch bản ở nền. Xong sẽ hiện ở mục Kịch bản với nhãn “Mới”.`);
    }
    emit('submitted', items.length);
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-5">
    <section>
      <div class="flex items-baseline justify-between gap-2">
        <p class="form-label mb-0">Sản phẩm</p>
        <button
          v-if="selectedIds.length"
          type="button"
          class="text-[0.82rem] font-semibold text-primary hover:underline"
          :disabled="submitting"
          @click="selectedIds = []"
        >
          Bỏ chọn ({{ selectedIds.length }})
        </button>
      </div>
      <p class="mb-2 text-[0.82rem] text-muted">Chọn nhiều sản phẩm (tối đa {{ MAX_PRODUCTS }}) — mỗi sản phẩm một kịch bản riêng.</p>
      <div class="relative mb-2">
        <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input v-model="keyword" class="field w-full pl-9" type="search" placeholder="Tìm theo tên, thương hiệu, danh mục…" />
      </div>
      <ul class="max-h-[260px] space-y-2 overflow-y-auto pr-1">
        <li v-for="item in filteredProducts" :key="item.id">
          <label
            class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
            :class="
              selectedIds.includes(item.id) ? 'border-primary bg-primary-soft/60' : 'border-line hover:border-primary/40 hover:bg-hover'
            "
          >
            <input
              class="size-5 shrink-0 accent-(--primary)"
              type="checkbox"
              :checked="selectedIds.includes(item.id)"
              :disabled="submitting || (reachedLimit && !selectedIds.includes(item.id))"
              @change="toggleProduct(item.id)"
            />
            <ProductThumb :name="item.name" :color="item.color" :image-url="item.imageUrl ?? null" :size="44" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ item.name }}</span>
              <span class="block truncate text-[0.82rem] text-muted">{{ item.category }} · {{ item.brand }}</span>
            </span>
            <span class="shrink-0 font-semibold tabular-nums">{{ formatCurrency(item.price) }}</span>
          </label>
        </li>
        <li v-if="filteredProducts.length === 0" class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">
          Không tìm thấy sản phẩm phù hợp.
          <NuxtLink to="/products" class="font-semibold text-primary hover:underline">Thêm sản phẩm</NuxtLink>
        </li>
      </ul>
    </section>

    <section>
      <p class="form-label">Định dạng kịch bản</p>
      <p v-if="loadingTemplates" class="text-[0.85rem] text-muted">Đang tải định dạng…</p>
      <p v-else-if="templates.length === 0" class="text-[0.85rem] text-muted">Chưa có định dạng nào — kiểm tra API `/api/templates`.</p>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="item in templates"
          :key="item.id"
          type="button"
          class="rounded-xl border p-3 text-left transition-colors"
          :class="
            templateId === item.id
              ? 'border-primary bg-primary-soft/60 ring-2 ring-primary/20'
              : 'border-line hover:border-primary/40 hover:bg-hover'
          "
          :aria-pressed="templateId === item.id"
          :disabled="submitting"
          @click="templateId = item.id"
        >
          <span class="block text-[0.92rem] leading-snug font-semibold">{{ item.name }}</span>
          <span class="mt-1 block text-[0.78rem] leading-snug text-muted">{{ templateOutline(item) }}</span>
          <span class="mt-1 block text-[0.75rem] text-muted">{{ item.content.tone }}</span>
        </button>
      </div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <p class="text-[0.88rem] text-muted">
        <template v-if="selectedIds.length && template">
          {{ selectedIds.length }} kịch bản theo định dạng <strong class="text-fg">{{ template.name }}</strong>.
        </template>
        <template v-else>Chọn ít nhất một sản phẩm và một định dạng.</template>
      </p>
      <div class="flex gap-2">
        <button type="button" class="btn" :disabled="submitting" @click="emit('cancel')">Huỷ</button>
        <button type="button" class="btn btn-primary" :disabled="submitting || selectedIds.length === 0 || !template" @click="submit">
          <AppIcon name="sparkles" :size="16" :class="submitting ? 'animate-pulse' : ''" />
          {{ submitting ? 'Đang gửi…' : `Gửi AI viết kịch bản (${selectedIds.length})` }}
        </button>
      </div>
    </div>
  </div>
</template>
