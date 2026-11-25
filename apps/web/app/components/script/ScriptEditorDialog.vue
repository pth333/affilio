<script setup lang="ts">
// Một popup cho cả tự viết kịch bản mới (scriptId = null) và xem/sửa kịch bản có sẵn.
//   - Lưu: tạo phiên bản mới khi lời thoại đổi (server trả 409 nếu có người vừa lưu bản mới hơn)
//   - AI viết lại: AI viết lại toàn bộ ở nền, popup đóng ngay
//   - Tạo video: lưu nếu đang sửa dở rồi dựng video từ đúng phiên bản đó (server kiểm luật lại)
//   - Lưu trữ: ẩn khỏi danh sách, video đã tạo không bị ảnh hưởng
import { SCRIPT_STATUS_LABEL, type ScriptDetail, type ScriptTemplate } from '~/types';

const props = defineProps<{ open: boolean; scriptId: string | null }>();
const emit = defineEmits<{ close: []; changed: [] }>();

type Action = 'save' | 'video' | 'regenerate' | 'archive';

/** Một cảnh trong trình soạn: vai trò + gợi ý từ template, lời thoại người dùng sửa. */
interface EditorScene {
  role: string;
  brief: string;
  narration: string;
  visualType: string | null;
}

const { products, ensureApiProductId } = useProductLibrary();

/** Id kịch bản đang mở; tự viết lưu lần đầu xong thì chuyển sang chế độ sửa kịch bản vừa tạo. */
const currentId = ref<string | null>(null);
const detail = ref<ScriptDetail | null>(null);
const scenes = ref<EditorScene[]>([]);
const loading = ref(false);
const action = ref<Action | null>(null);

// Chế độ tự viết
const templates = ref<ScriptTemplate[]>([]);
const templateId = ref('');
const productId = ref('');

const isCreate = computed(() => currentId.value === null);
const busy = computed(() => loading.value || action.value !== null);
const status = computed(() => detail.value?.script.status ?? null);
const isReady = computed(() => status.value === 'ready' && detail.value?.version !== null);
const canRegenerate = computed(() => status.value === 'ready' || status.value === 'failed');
const hasEmptyScene = computed(() => scenes.value.length === 0 || scenes.value.some((scene) => scene.narration.trim().length === 0));
const isDirty = computed(() => {
  const saved = detail.value?.version?.spec.scenes;
  if (!saved) return false;
  return scenes.value.some((scene, index) => scene.narration !== saved[index]?.narration);
});
const failedRules = computed(() => detail.value?.rules.filter((rule) => !rule.passed) ?? []);
const needsProductFix = computed(() => failedRules.value.some((rule) => PRODUCT_DATA_RULES.includes(rule.rule)));
const selectedTemplate = computed(() => templates.value.find((item) => item.id === templateId.value) ?? null);
const title = computed(() => {
  if (isCreate.value) return 'Tự viết kịch bản';
  return detail.value?.productName ?? 'Kịch bản';
});

/** Dựng danh sách cảnh từ khung template (khi tự viết) — lời thoại trống, gợi ý làm placeholder. */
function scenesFromTemplate(template: ScriptTemplate | null): EditorScene[] {
  return (template?.content.scenes ?? []).map((scene) => ({
    role: scene.role,
    brief: scene.brief ?? '',
    narration: '',
    visualType: null,
  }));
}

/** Dựng danh sách cảnh từ phiên bản đã lưu, kèm gợi ý template theo thứ tự cảnh. */
function scenesFromDetail(data: ScriptDetail): EditorScene[] {
  return (data.version?.spec.scenes ?? []).map((scene, index) => ({
    role: scene.role,
    brief: data.template.scenes[index]?.brief ?? '',
    narration: scene.narration,
    visualType: scene.visual.type,
  }));
}

async function loadDetail(id: string): Promise<void> {
  loading.value = true;
  try {
    const data = await scriptApi.getScriptDetail(id);
    detail.value = data;
    scenes.value = scenesFromDetail(data);
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    loading.value = false;
  }
}

async function loadTemplates(): Promise<void> {
  loading.value = true;
  try {
    const { items } = await templateApi.getTemplates();
    templates.value = items;
    templateId.value = items[0]?.id ?? '';
    scenes.value = scenesFromTemplate(items[0] ?? null);
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    loading.value = false;
  }
}

/** Đổi template khi tự viết: giữ lời thoại đã gõ theo thứ tự cảnh, phần dư bỏ đi. */
function changeTemplate(id: string): void {
  templateId.value = id;
  const previous = scenes.value;
  scenes.value = scenesFromTemplate(selectedTemplate.value).map((scene, index) => ({
    ...scene,
    narration: previous[index]?.narration ?? '',
  }));
}

watch(
  () => [props.open, props.scriptId] as const,
  ([open, id]) => {
    if (!open) return;
    currentId.value = id;
    detail.value = null;
    scenes.value = [];
    productId.value = products.value[0]?.id ?? '';
    if (id) void loadDetail(id);
    else void loadTemplates();
  },
  { immediate: true },
);

const narrations = (): { narration: string }[] => scenes.value.map((scene) => ({ narration: scene.narration.trim() }));

/** Chạy một thao tác; trả về false nếu lỗi (interceptor đã hiện thông báo). */
async function run(kind: Action, task: () => Promise<void>): Promise<boolean> {
  if (busy.value) return false;
  action.value = kind;
  try {
    await task();
    return true;
  } catch {
    // interceptor đã hiện thông báo lỗi (409 = kịch bản vừa có bản mới — đóng rồi mở lại để xem)
    return false;
  } finally {
    action.value = null;
  }
}

/** Lưu lời thoại; trả về versionId hiện tại sau khi lưu. */
async function persist(): Promise<string> {
  if (isCreate.value) {
    const product = products.value.find((item) => item.id === productId.value);
    if (!product || !selectedTemplate.value) throw new Error('Chưa chọn sản phẩm hoặc định dạng');
    const apiProductId = await ensureApiProductId(product);
    const created = await scriptApi.createManual({ productId: apiProductId, templateId: selectedTemplate.value.id, scenes: narrations() });
    currentId.value = created.id;
    await loadDetail(created.id);
    const versionId = detail.value?.version?.id;
    if (!versionId) throw new Error('Không đọc được kịch bản vừa lưu');
    return versionId;
  }
  const id = currentId.value;
  const version = detail.value?.version;
  if (!id || !version) throw new Error('Kịch bản chưa sẵn sàng');
  if (!isDirty.value) return version.id;
  const saved = await scriptApi.updateScript(id, { versionId: version.id, scenes: narrations() });
  await loadDetail(id);
  return saved.versionId;
}

async function save(): Promise<void> {
  const ok = await run('save', async () => {
    await persist();
  });
  if (!ok) return;
  message.success('Đã lưu kịch bản.');
  emit('changed');
}

async function createVideo(): Promise<void> {
  const ok = await run('video', async () => {
    const versionId = await persist();
    const id = currentId.value;
    if (!id) throw new Error('Kịch bản chưa được lưu');
    await scriptApi.createVideo(id, { versionId });
  });
  if (!ok) return;
  message.success('Đã tạo video — AI đang dựng preview. Theo dõi ở trang Video, xong sẽ vào Hộp thư duyệt.');
  emit('changed');
  emit('close');
}

async function regenerate(): Promise<void> {
  const id = currentId.value;
  if (!id) return;
  const ok = await run('regenerate', async () => {
    await scriptApi.regenerate(id);
  });
  if (!ok) return;
  message.success('AI đang viết lại kịch bản ở nền.');
  emit('changed');
  emit('close');
}

async function archive(): Promise<void> {
  const id = currentId.value;
  if (!id) return;
  const ok = await run('archive', async () => {
    await scriptApi.archive(id);
  });
  if (!ok) return;
  message.success('Đã lưu trữ kịch bản.');
  emit('changed');
  emit('close');
}
</script>

<template>
  <AppModal
    :open="props.open"
    :busy="action !== null"
    :width="820"
    :eyebrow="isCreate ? 'Kịch bản mới' : 'Kịch bản'"
    :title="title"
    :description="
      isCreate
        ? 'Viết lời thoại cho từng cảnh theo định dạng đã chọn. Lưu xong có thể tạo video ngay.'
        : 'Sửa lời thoại nếu cần. Video chỉ được dựng khi bạn bấm “Tạo video”; một kịch bản dùng được nhiều lần.'
    "
    @close="emit('close')"
  >
    <p v-if="loading && scenes.length === 0" class="flex items-center gap-2 py-8 text-muted">
      <AppIcon name="rotate-ccw" :size="16" class="animate-spin" /> Đang tải…
    </p>

    <div v-else class="space-y-4">
      <!-- Tự viết: chọn sản phẩm + định dạng -->
      <div v-if="isCreate" class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="form-label" for="script-product">Sản phẩm</label>
          <select id="script-product" v-model="productId" class="field h-11 w-full" :disabled="busy">
            <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <p v-if="products.length === 0" class="form-hint">
            Chưa có sản phẩm — <NuxtLink to="/products" class="font-semibold text-primary hover:underline">thêm sản phẩm</NuxtLink>.
          </p>
        </div>
        <div>
          <label class="form-label" for="script-template">Định dạng</label>
          <select
            id="script-template"
            :value="templateId"
            class="field h-11 w-full"
            :disabled="busy"
            @change="changeTemplate(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <p v-if="selectedTemplate" class="form-hint">{{ templateOutline(selectedTemplate) }} · {{ selectedTemplate.content.tone }}</p>
        </div>
      </div>

      <!-- Xem/sửa: thông tin kịch bản -->
      <div v-else-if="detail" class="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-hover/40 px-3 py-2 text-[0.85rem]">
        <ProductThumb v-if="detail.productName" :name="detail.productName" :color="pickAccentColor(detail.productName)" :size="28" />
        <span class="font-semibold">{{ detail.productName }}</span>
        <span class="text-line">•</span>
        <span class="text-muted">{{ detail.script.origin === 'ai' ? 'AI viết' : 'Tự viết' }}</span>
        <template v-if="detail.version">
          <span class="text-line">•</span>
          <span class="text-muted">Phiên bản {{ detail.version.versionNo }}</span>
        </template>
        <span class="text-line">•</span>
        <span class="text-muted">Đã tạo {{ detail.videoCount }} video</span>
        <span class="badge bg-hover text-muted">{{ SCRIPT_STATUS_LABEL[detail.script.status] }}</span>
      </div>

      <p v-if="status === 'writing'" class="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-4 text-[0.92rem] text-primary-strong">
        <AppIcon name="rotate-ccw" :size="16" class="animate-spin" />
        AI đang viết kịch bản này ở nền. Bạn cứ đóng popup — xong sẽ hiện ở danh sách với nhãn “Mới”.
      </p>

      <div v-if="status === 'failed'" class="rounded-xl border border-bad/40 bg-bad-soft/50 px-4 py-3 text-[0.88rem] text-bad">
        AI viết kịch bản lỗi<span v-if="detail?.script.failedReason">: {{ detail.script.failedReason }}</span>. Bấm “AI viết lại” để thử lại.
      </div>

      <div v-if="failedRules.length" class="space-y-1 rounded-xl border border-warn/40 bg-warn-soft/50 px-3 py-2">
        <p v-for="rule in failedRules" :key="rule.rule" class="text-[0.82rem] text-warn">
          • {{ CHECK_RULE_LABEL[rule.rule] ?? rule.rule }}<span v-if="rule.message"> — {{ rule.message }}</span>
        </p>
        <p v-if="needsProductFix" class="text-[0.82rem] text-muted">
          Lỗi này nằm ở dữ liệu sản phẩm —
          <NuxtLink to="/products" class="font-semibold text-primary hover:underline">bổ sung ở trang Sản phẩm</NuxtLink>
          rồi quay lại bấm “Tạo video”.
        </p>
      </div>

      <ol v-if="scenes.length" class="space-y-3">
        <li v-for="(scene, index) in scenes" :key="index" class="rounded-xl border border-line p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="flex items-center gap-2">
              <span class="grid size-6 place-items-center rounded-md bg-hover text-[0.75rem] font-bold tabular-nums">{{ index + 1 }}</span>
              <span class="text-[0.9rem] font-semibold">{{ SCENE_ROLE_LABEL[scene.role] ?? scene.role }}</span>
              <span
                v-if="scene.visualType"
                class="badge"
                :class="scene.visualType === 'image' ? 'bg-ok-soft text-ok' : 'bg-primary-soft text-primary'"
              >
                {{ scene.visualType === 'image' ? 'Ảnh sản phẩm' : 'Ảnh AI' }}
              </span>
            </span>
            <span class="text-[0.75rem] text-muted tabular-nums">{{ scene.narration.length }}/{{ SCRIPT_NARRATION_MAX }}</span>
          </div>
          <textarea
            v-model="scene.narration"
            class="field min-h-[72px] w-full text-[0.92rem] leading-relaxed"
            :maxlength="SCRIPT_NARRATION_MAX"
            :placeholder="scene.brief || 'Lời thoại của cảnh này'"
            :disabled="busy || (!isCreate && !isReady)"
          />
        </li>
      </ol>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-[0.88rem] text-muted">
          <template v-if="(isCreate || isReady) && hasEmptyScene">Còn cảnh chưa có lời thoại — điền hết rồi mới lưu được.</template>
          <template v-else-if="isDirty">Có thay đổi chưa lưu.</template>
        </p>
        <div class="flex flex-wrap gap-2">
          <button v-if="!isCreate && canRegenerate" type="button" class="btn" :disabled="busy" @click="archive">
            {{ action === 'archive' ? 'Đang lưu trữ…' : 'Lưu trữ' }}
          </button>
          <button v-if="!isCreate && canRegenerate" type="button" class="btn" :disabled="busy" @click="regenerate">
            <AppIcon name="rotate-ccw" :size="16" :class="action === 'regenerate' ? 'animate-spin' : ''" />
            AI viết lại
          </button>
          <button
            v-if="isCreate || isReady"
            type="button"
            class="btn"
            :disabled="busy || hasEmptyScene || (!isCreate && !isDirty) || (isCreate && !productId)"
            @click="save"
          >
            {{ action === 'save' ? 'Đang lưu…' : 'Lưu' }}
          </button>
          <button
            v-if="isCreate || isReady"
            type="button"
            class="btn btn-primary"
            :disabled="busy || hasEmptyScene || (isCreate && !productId)"
            @click="createVideo"
          >
            <AppIcon name="film" :size="16" :class="action === 'video' ? 'animate-pulse' : ''" />
            {{ action === 'video' ? 'Đang gửi…' : 'Tạo video' }}
          </button>
        </div>
      </div>
    </template>
  </AppModal>
</template>
