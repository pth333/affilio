<script setup lang="ts">
// Popup tạo video: chọn kênh sáng tạo, sản phẩm (tích nhiều), định dạng kịch bản và số hook mỗi sản phẩm.
// Mỗi hook tương ứng một video nháp riêng để người duyệt chọn bản tốt nhất.
import { CHANNELS, VIDEO_FORMATS } from '~/data/mock';
import type { Channel, VideoFormat } from '~/types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [number] }>();

const { products, ensureApiProductId } = useProductLibrary();

const channels = CHANNELS.filter((channel) => channel.status === 'active');
const channelId = ref(channels[0]?.id ?? '');
const formatId = ref(VIDEO_FORMATS[0]?.id ?? '');
const selectedIds = ref<string[]>([]);
const keyword = ref('');
const hooksPerProduct = ref(2);
const busy = ref(false);

const selectedChannel = computed<Channel | null>(() => channels.find((channel) => channel.id === channelId.value) ?? null);

const filteredProducts = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return products.value;
  return products.value.filter((product) => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query));
});

const selectedProducts = computed(() => products.value.filter((product) => selectedIds.value.includes(product.id)));
const allVisibleSelected = computed(
  () => filteredProducts.value.length > 0 && filteredProducts.value.every((product) => selectedIds.value.includes(product.id)),
);
const totalVideos = computed(() => selectedProducts.value.length * hooksPerProduct.value);

function toggleProduct(productId: string): void {
  selectedIds.value = selectedIds.value.includes(productId)
    ? selectedIds.value.filter((id) => id !== productId)
    : [...selectedIds.value, productId];
}

function toggleAllVisible(): void {
  const visibleIds = filteredProducts.value.map((product) => product.id);
  selectedIds.value = allVisibleSelected.value
    ? selectedIds.value.filter((id) => !visibleIds.includes(id))
    : [...new Set([...selectedIds.value, ...visibleIds])];
}

function selectFormat(format: VideoFormat): void {
  formatId.value = format.id;
}

function changeHookCount(delta: number): void {
  hooksPerProduct.value = clamp(hooksPerProduct.value + delta, 1, 5);
}

async function startCreating(): Promise<void> {
  if (!selectedProducts.value.length || busy.value) return;
  busy.value = true;
  try {
    // Sản phẩm thư viện chỉ có ở client: bảo đảm có id trên API trước khi tạo video.
    const apiProductIds = await Promise.all(selectedProducts.value.map((product) => ensureApiProductId(product)));
    const requests = apiProductIds.flatMap((productId) =>
      Array.from({ length: hooksPerProduct.value }, () => videoApi.createVideo(productId)),
    );
    await Promise.all(requests);

    message.success(`Đã tạo ${requests.length} video nháp. AI đang viết kịch bản.`);
    selectedIds.value = [];
    keyword.value = '';
    emit('created', requests.length);
    emit('close');
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    :open="props.open"
    :busy="busy"
    :width="780"
    eyebrow="Video mới"
    title="Tạo video nháp"
    description="Chọn kênh, sản phẩm và định dạng — AI viết kịch bản cho từng hook."
    @close="emit('close')"
  >
    <div class="space-y-5">
      <!-- Kênh sáng tạo -->
      <section>
        <label class="form-label" for="video-channel">Kênh sáng tạo</label>
        <div class="relative">
          <select id="video-channel" v-model="channelId" class="field h-11 w-full appearance-none pr-9 font-medium" :disabled="busy">
            <option v-for="channel in channels" :key="channel.id" :value="channel.id">
              {{ channel.name }} · {{ channel.handle }}
            </option>
          </select>
          <AppIcon name="chevron-down" :size="16" class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
        </div>
        <p v-if="selectedChannel" class="form-hint flex flex-wrap items-center gap-x-2 gap-y-1">
          <AppIcon name="layers" :size="14" class="text-primary" />
          <span>{{ selectedChannel.series }}</span>
          <span class="text-line">•</span>
          <span>{{ formatCompact(selectedChannel.followers) }} người theo dõi</span>
          <span class="text-line">•</span>
          <span>{{ selectedChannel.tag }}</span>
        </p>
      </section>

      <!-- Chọn sản phẩm -->
      <section>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="form-label mb-0">Chọn sản phẩm</p>
            <p class="text-[0.82rem] text-muted">Tích các sản phẩm cần tạo video nháp.</p>
          </div>
          <button type="button" class="text-[0.85rem] font-semibold text-primary hover:underline" @click="toggleAllVisible">
            {{ allVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
          </button>
        </div>

        <div class="relative mb-2">
          <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input v-model="keyword" class="field w-full pl-9" type="search" placeholder="Tìm theo tên, thương hiệu, danh mục…" />
        </div>

        <ul class="max-h-[216px] space-y-2 overflow-y-auto pr-1">
          <li v-for="product in filteredProducts" :key="product.id">
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
              :class="
                selectedIds.includes(product.id)
                  ? 'border-primary bg-primary-soft/60'
                  : 'border-line hover:border-primary/40 hover:bg-hover'
              "
            >
              <input
                type="checkbox"
                class="size-5 shrink-0 accent-(--primary)"
                :checked="selectedIds.includes(product.id)"
                :disabled="busy"
                @change="toggleProduct(product.id)"
              />
              <ProductThumb :name="product.name" :color="product.color" :image-url="product.imageUrl ?? null" :size="44" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ product.name }}</span>
                <span class="block truncate text-[0.82rem] text-muted">
                  {{ product.category }} · {{ product.brand }}
                </span>
              </span>
              <span class="shrink-0 text-right">
                <span class="block font-semibold tabular-nums">{{ formatCurrency(product.price) }}</span>
                <span v-if="(product.clips?.length ?? 0) > 0" class="badge mt-1 bg-ok-soft text-ok">
                  <AppIcon name="film" :size="11" /> {{ product.clips?.length }} clip
                </span>
                <span v-else-if="product.hasClip" class="badge mt-1 bg-ok-soft text-ok">
                  <AppIcon name="film" :size="11" /> Có clip
                </span>
              </span>
            </label>
          </li>
          <li v-if="filteredProducts.length === 0" class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">
            Không tìm thấy sản phẩm phù hợp.
            <NuxtLink to="/products" class="font-semibold text-primary hover:underline">Thêm sản phẩm</NuxtLink>
          </li>
        </ul>

        <p class="mt-2 text-[0.82rem] text-muted">
          Đã chọn <strong class="text-fg">{{ selectedProducts.length }}</strong> sản phẩm
        </p>
      </section>

      <!-- Định dạng -->
      <section>
        <p class="form-label">Định dạng</p>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="format in VIDEO_FORMATS"
            :key="format.id"
            type="button"
            class="flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors"
            :class="
              formatId === format.id
                ? 'border-primary bg-primary-soft/60 ring-2 ring-primary/20'
                : 'border-line hover:border-primary/40 hover:bg-hover'
            "
            :aria-pressed="formatId === format.id"
            :disabled="busy"
            @click="selectFormat(format)"
          >
            <span
              class="grid size-8 shrink-0 place-items-center rounded-lg text-[0.85rem] font-bold"
              :class="formatId === format.id ? 'bg-primary text-white' : 'bg-hover text-muted'"
            >
              {{ format.glyph }}
            </span>
            <span class="min-w-0">
              <span class="block text-[0.92rem] leading-snug font-semibold">{{ format.name }}</span>
              <span class="mt-0.5 block text-[0.78rem] leading-snug text-muted">{{ format.description }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- Số hook / sản phẩm -->
      <section>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="form-label mb-0">Số hook / sản phẩm</p>
            <p class="text-[0.82rem] text-muted">Mỗi hook là một bản nháp riêng để bạn chọn bản tốt nhất.</p>
          </div>
          <div class="flex items-center gap-1 rounded-lg border border-line p-1">
            <button
              type="button"
              class="icon-btn size-8 disabled:opacity-40"
              aria-label="Giảm số hook"
              :disabled="hooksPerProduct <= 1 || busy"
              @click="changeHookCount(-1)"
            >
              <AppIcon name="minus" :size="16" />
            </button>
            <span class="w-8 text-center font-semibold tabular-nums">{{ hooksPerProduct }}</span>
            <button
              type="button"
              class="icon-btn size-8 disabled:opacity-40"
              aria-label="Tăng số hook"
              :disabled="hooksPerProduct >= 5 || busy"
              @click="changeHookCount(1)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-[0.88rem] text-muted">
          <template v-if="selectedProducts.length">
            <strong class="text-fg">{{ selectedProducts.length }}</strong> sản phẩm ×
            <strong class="text-fg">{{ hooksPerProduct }}</strong> hook =
            <strong class="text-primary-strong">{{ totalVideos }} video nháp</strong>
          </template>
          <template v-else>Chọn ít nhất một sản phẩm để bắt đầu.</template>
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn" :disabled="busy" @click="emit('close')">Huỷ</button>
          <button type="button" class="btn btn-primary" :disabled="busy || selectedProducts.length === 0" @click="startCreating">
            <AppIcon name="sparkles" :size="16" :class="busy ? 'animate-pulse' : ''" />
            {{ busy ? 'Đang tạo…' : 'Bắt đầu tạo video' }}
          </button>
        </div>
      </div>
    </template>
  </AppModal>
</template>
