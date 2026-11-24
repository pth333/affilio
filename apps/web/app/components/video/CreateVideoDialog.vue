<script setup lang="ts">
// Popup tạo video 2 bước:
//   1. chọn sản phẩm + định dạng (template) → API ghép prompt từ template và gọi AI gợi ý kịch bản
//   2. người dùng đọc/sửa lời thoại từng cảnh rồi mới tạo video (workflow không gọi AI lại)
import { CHANNELS } from '~/data/mock';
import type { Channel, ScriptSuggestion, ScriptTemplate } from '~/types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [number] }>();

const { products, ensureApiProductId } = useProductLibrary();

const MAX_NARRATION = 400;

const channels = CHANNELS.filter((channel) => channel.status === 'active');
const channelId = ref(channels[0]?.id ?? '');
const templates = ref<ScriptTemplate[]>([]);
const templateId = ref('');
const loadingTemplates = ref(false);
const keyword = ref('');
const productId = ref('');
const suggesting = ref(false);
const creating = ref(false);
const step = ref<'setup' | 'script'>('setup');
const suggestion = ref<ScriptSuggestion | null>(null);

const busy = computed(() => suggesting.value || creating.value);
const selectedChannel = computed<Channel | null>(() => channels.find((channel) => channel.id === channelId.value) ?? null);
const product = computed(() => products.value.find((item) => item.id === productId.value) ?? null);
const template = computed(() => templates.value.find((item) => item.id === templateId.value) ?? null);
const scenes = computed(() => suggestion.value?.spec.scenes ?? []);
const hasEmptyScene = computed(() => scenes.value.some((scene) => scene.narration.trim().length === 0));
const failedRules = computed(() => suggestion.value?.rules.filter((rule) => !rule.passed) ?? []);

const filteredProducts = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return products.value;
  return products.value.filter((item) => `${item.name} ${item.brand} ${item.category}`.toLowerCase().includes(query));
});

/** Tóm tắt định dạng: Mở đầu → Vấn đề → Lợi ích → Kêu gọi. */
function templateOutline(item: ScriptTemplate): string {
  return item.content.scenes.map((scene) => SCENE_ROLE_LABEL[scene.role] ?? scene.role).join(' → ');
}

async function loadTemplates(): Promise<void> {
  if (loadingTemplates.value) return;
  loadingTemplates.value = true;
  try {
    const { items } = await templateApi.getTemplates();
    templates.value = items;
    templateId.value = items.some((item) => item.id === templateId.value) ? templateId.value : (items[0]?.id ?? '');
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    loadingTemplates.value = false;
  }
}

function reset(): void {
  step.value = 'setup';
  suggestion.value = null;
  productId.value = '';
  keyword.value = '';
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    reset();
    void loadTemplates();
  },
  { immediate: true },
);

async function suggestScript(): Promise<void> {
  if (!product.value || !template.value || suggesting.value) return;
  suggesting.value = true;
  try {
    // Sản phẩm thư viện chỉ có ở client: bảo đảm có id trên API trước khi gọi AI.
    const apiProductId = await ensureApiProductId(product.value);
    suggestion.value = await videoApi.suggestScript({ productId: apiProductId, templateId: template.value.id });
    step.value = 'script';
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    suggesting.value = false;
  }
}

async function createVideo(): Promise<void> {
  if (!product.value || !template.value || !suggestion.value || creating.value) return;
  creating.value = true;
  try {
    const apiProductId = await ensureApiProductId(product.value);
    await videoApi.createVideo({ productId: apiProductId, templateId: template.value.id, spec: suggestion.value.spec });
    message.success('Đã tạo video từ kịch bản bạn duyệt. AI đang kiểm tra và dựng preview.');
    emit('created', 1);
    emit('close');
    reset();
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    creating.value = false;
  }
}

function backToSetup(): void {
  step.value = 'setup';
  suggestion.value = null;
}
</script>

<template>
  <AppModal
    :open="props.open"
    :busy="busy"
    :width="820"
    eyebrow="Video mới"
    :title="step === 'setup' ? 'Chọn sản phẩm và định dạng' : 'Duyệt kịch bản AI gợi ý'"
    :description="
      step === 'setup'
        ? 'Định dạng quyết định cấu trúc kịch bản. AI gợi ý xong bạn sẽ đọc và sửa trước khi tạo video.'
        : 'Sửa lời thoại từng cảnh nếu cần. Video chỉ được tạo khi bạn bấm “Tạo video với kịch bản này”.'
    "
    @close="emit('close')"
  >
    <!-- Bước 1: sản phẩm + định dạng -->
    <div v-if="step === 'setup'" class="space-y-5">
      <!-- Kênh đăng video -->
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

      <section>
        <p class="form-label mb-0">Sản phẩm</p>
        <p class="mb-2 text-[0.82rem] text-muted">Mỗi lần tạo một video cho một sản phẩm.</p>
        <div class="relative mb-2">
          <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input v-model="keyword" class="field w-full pl-9" type="search" placeholder="Tìm theo tên, thương hiệu, danh mục…" />
        </div>
        <ul class="max-h-[220px] space-y-2 overflow-y-auto pr-1">
          <li v-for="item in filteredProducts" :key="item.id">
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
              :class="
                productId === item.id ? 'border-primary bg-primary-soft/60' : 'border-line hover:border-primary/40 hover:bg-hover'
              "
            >
              <input
                class="size-5 shrink-0 accent-(--primary)"
                type="radio"
                name="video-product"
                :checked="productId === item.id"
                :disabled="busy"
                @change="productId = item.id"
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
        <p v-else-if="templates.length === 0" class="text-[0.85rem] text-muted">
          Chưa có định dạng nào — kiểm tra API `/api/templates`.
        </p>
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
            :disabled="busy"
            @click="templateId = item.id"
          >
            <span class="block text-[0.92rem] leading-snug font-semibold">{{ item.name }}</span>
            <span class="mt-1 block text-[0.78rem] leading-snug text-muted">{{ templateOutline(item) }}</span>
            <span class="mt-1 block text-[0.75rem] text-muted">{{ item.content.tone }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- Bước 2: duyệt / sửa kịch bản -->
    <div v-else-if="suggestion" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-hover/40 px-3 py-2 text-[0.85rem]">
        <ProductThumb v-if="product" :name="product.name" :color="product.color" :image-url="product.imageUrl ?? null" :size="28" />
        <span class="font-semibold">{{ product?.name }}</span>
        <span class="text-line">•</span>
        <span class="text-muted">{{ suggestion.template.name }}</span>
        <span class="text-line">•</span>
        <span class="text-muted">{{ scenes.length }} cảnh</span>
        <span v-if="failedRules.length" class="badge bg-warn-soft text-warn">{{ failedRules.length }} luật cần lưu ý</span>
        <span v-if="selectedChannel" class="badge ml-auto bg-primary-soft text-primary">{{ selectedChannel.name }}</span>
      </div>

      <div v-if="failedRules.length" class="space-y-1 rounded-xl border border-warn/40 bg-warn-soft/50 px-3 py-2">
        <p v-for="rule in failedRules" :key="rule.rule" class="text-[0.82rem] text-warn">
          • {{ CHECK_RULE_LABEL[rule.rule] ?? rule.rule }}<span v-if="rule.message"> — {{ rule.message }}</span>
        </p>
      </div>

      <ol class="space-y-3">
        <li v-for="(scene, index) in scenes" :key="scene.id" class="rounded-xl border border-line p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="flex items-center gap-2">
              <span class="grid size-6 place-items-center rounded-md bg-hover text-[0.75rem] font-bold tabular-nums">
                {{ index + 1 }}
              </span>
              <span class="text-[0.9rem] font-semibold">{{ SCENE_ROLE_LABEL[scene.role] ?? scene.role }}</span>
              <span class="badge" :class="scene.visual.type === 'image' ? 'bg-ok-soft text-ok' : 'bg-primary-soft text-primary'">
                {{ scene.visual.type === 'image' ? 'Ảnh sản phẩm' : 'Ảnh AI' }}
              </span>
            </span>
            <span class="text-[0.75rem] text-muted tabular-nums">{{ scene.narration.length }}/{{ MAX_NARRATION }}</span>
          </div>
          <textarea
            v-model="scene.narration"
            class="field min-h-[72px] w-full text-[0.92rem] leading-relaxed"
            :maxlength="MAX_NARRATION"
            :disabled="creating"
          />
        </li>
      </ol>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p v-if="step === 'setup'" class="text-[0.88rem] text-muted">
          <template v-if="product && template">
            Kịch bản sẽ theo định dạng <strong class="text-fg">{{ template.name }}</strong>.
          </template>
          <template v-else>Chọn một sản phẩm và một định dạng để bắt đầu.</template>
        </p>
        <p v-else class="text-[0.88rem] text-muted">
          <template v-if="hasEmptyScene">Còn cảnh chưa có lời thoại — điền hết rồi mới tạo được video.</template>
          <template v-else>Video được tạo ngay với kịch bản này; AI không viết lại.</template>
        </p>
        <div class="flex gap-2">
          <button v-if="step === 'script'" type="button" class="btn" :disabled="busy" @click="backToSetup">Quay lại</button>
          <button type="button" class="btn" :disabled="busy" @click="emit('close')">Huỷ</button>
          <button
            v-if="step === 'setup'"
            type="button"
            class="btn btn-primary"
            :disabled="busy || !product || !template"
            @click="suggestScript"
          >
            <AppIcon name="sparkles" :size="16" :class="suggesting ? 'animate-pulse' : ''" />
            {{ suggesting ? 'AI đang viết kịch bản…' : 'Gợi ý kịch bản' }}
          </button>
          <button v-else type="button" class="btn btn-primary" :disabled="creating || hasEmptyScene" @click="createVideo">
            <AppIcon name="film" :size="16" :class="creating ? 'animate-pulse' : ''" />
            {{ creating ? 'Đang tạo video…' : 'Tạo video với kịch bản này' }}
          </button>
        </div>
      </div>
    </template>
  </AppModal>
</template>
