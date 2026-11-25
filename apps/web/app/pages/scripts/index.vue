<script setup lang="ts">
// Thư viện kịch bản (/api/scripts): AI viết ở nền hoặc tự viết; một kịch bản dùng tạo được nhiều video.
// Bấm tên sản phẩm mở ScriptEditorDialog để xem/sửa/tạo video. Lỗi request đã được http interceptor báo.
import type { TableColumn } from '@nuxt/ui';
import { SCRIPT_STATUSES, SCRIPT_STATUS_LABEL, type ScriptListItem, type ScriptStatus, type ScriptTemplate } from '~/types';

definePageMeta({ title: 'Kịch bản' });

const status = ref<ScriptStatus | ''>('');
const keyword = ref('');
const items = ref<ScriptListItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const templates = ref<ScriptTemplate[]>([]);
const showAiDialog = ref(false);
const editorOpen = ref(false);
/** null = tự viết kịch bản mới. */
const editorScriptId = ref<string | null>(null);
/** Kịch bản đang gửi tạo video từ nút trên dòng. */
const creatingId = ref<string | null>(null);

const columns: TableColumn<ScriptListItem>[] = [
  { accessorKey: 'productName', header: 'Sản phẩm' },
  { accessorKey: 'templateId', header: 'Định dạng', meta: { class: { th: 'hidden md:table-cell', td: 'hidden text-muted md:table-cell' } } },
  { accessorKey: 'origin', header: 'Nguồn', meta: { class: { th: 'w-28', td: 'w-28' } } },
  { accessorKey: 'status', header: 'Trạng thái', meta: { class: { th: 'w-44', td: 'w-44' } } },
  { accessorKey: 'videoCount', header: 'Video', meta: { class: { th: 'w-20 text-right', td: 'w-20 text-right tabular-nums' } } },
  {
    accessorKey: 'updatedAt',
    header: 'Cập nhật',
    meta: { class: { th: 'hidden w-44 sm:table-cell', td: 'hidden w-44 text-muted sm:table-cell' } },
  },
  { id: 'actions', header: '', meta: { class: { th: 'w-36', td: 'w-36 text-right' } } },
];

const STATUS_TONE: Record<ScriptStatus, string> = {
  writing: 'bg-primary-soft text-primary',
  ready: 'bg-ok-soft text-ok',
  failed: 'bg-bad-soft text-bad',
  archived: 'bg-hover text-muted',
};

const templateNames = computed(() => new Map(templates.value.map((item) => [item.id, item.name])));

/** Báo khi kịch bản AI vừa viết xong (đang viết → sẵn sàng) để người dùng không phải canh danh sách. */
function notifyReady(previous: ScriptListItem[], next: ScriptListItem[]): void {
  const before = new Map(previous.map((item) => [item.id, item.status]));
  const ready = next.filter((item) => item.status === 'ready' && before.get(item.id) === 'writing');
  if (ready.length === 1 && ready[0]) message.success(`Kịch bản cho “${ready[0].productName}” đã xong — bấm vào để xem và tạo video.`);
  else if (ready.length > 1) message.success(`${ready.length} kịch bản AI đã viết xong.`);
}

async function loadScripts(reset = true, silent = false): Promise<void> {
  loading.value = true;
  try {
    const page = await scriptApi.getScripts(
      {
        status: status.value || undefined,
        q: keyword.value.trim() || undefined,
        cursor: reset ? undefined : (cursor.value ?? undefined),
        limit: 30,
      },
      { silent },
    );
    if (silent) notifyReady(items.value, page.items);
    items.value = reset ? page.items : [...items.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (err) {
    // Đã báo lỗi qua interceptor; giữ nguyên danh sách hiện tại.
    if (silent) console.warn('[scripts] làm mới ngầm thất bại', err);
  } finally {
    loading.value = false;
  }
}

async function loadTemplates(): Promise<void> {
  try {
    const { items: list } = await templateApi.getTemplates();
    templates.value = list;
  } catch {
    // interceptor đã hiện thông báo lỗi
  }
}

function openEditor(id: string | null): void {
  editorScriptId.value = id;
  editorOpen.value = true;
}

/** Tạo video ngay từ dòng kịch bản (dùng phiên bản hiện tại). Lỗi luật → mở popup để thấy cảnh báo chi tiết. */
async function createVideo(item: ScriptListItem): Promise<void> {
  if (creatingId.value || !item.currentVersionId) return;
  creatingId.value = item.id;
  try {
    await scriptApi.createVideo(item.id, { versionId: item.currentVersionId });
    message.success(`Đã tạo video cho “${item.productName}” — AI đang dựng preview, xong sẽ vào Hộp thư duyệt.`);
    await loadScripts(true, true);
  } catch {
    // interceptor đã hiện thông báo lỗi; mở popup để xem cảnh báo luật / phiên bản mới nhất
    openEditor(item.id);
  } finally {
    creatingId.value = null;
  }
}

/** Kịch bản AI mới ở trạng thái "đang viết": bỏ lọc để người dùng thấy ngay. */
function handleAiCreated(): void {
  if (status.value === '') void loadScripts();
  else status.value = '';
}

watch(status, () => loadScripts());

// Tìm theo tên sản phẩm: chờ người dùng gõ xong mới gọi API.
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadScripts(), 350);
});

// Tự làm mới khi còn kịch bản AI đang viết.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void loadScripts();
  void loadTemplates();
  timer = setInterval(() => {
    if (!loading.value && items.value.some((item) => item.status === 'writing')) void loadScripts(true, true);
  }, 5000);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(searchTimer);
});
</script>

<template>
  <PageHeader
    title="Kịch bản"
    description="Kho kịch bản cho từng sản phẩm — AI viết hoặc bạn tự viết. Một kịch bản dùng tạo được nhiều video."
  >
    <template #actions>
      <button class="btn" @click="openEditor(null)"><AppIcon name="file-text" :size="17" /> Tự viết</button>
      <button class="btn btn-primary" @click="showAiDialog = true"><AppIcon name="sparkles" :size="17" /> AI viết kịch bản</button>
    </template>
  </PageHeader>

  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
      <div>
        <h2 class="text-[1.1rem] font-semibold">Danh sách kịch bản</h2>
        <p class="text-[0.85rem] text-muted">Trang tự làm mới khi còn kịch bản AI đang viết.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative">
          <AppIcon name="search" :size="15" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input v-model="keyword" class="field h-9 w-56 pl-8" type="search" placeholder="Tìm theo tên sản phẩm…" />
        </div>
        <select v-model="status" class="field h-9">
          <option value="">Tất cả (trừ đã lưu trữ)</option>
          <option v-for="s in SCRIPT_STATUSES" :key="s" :value="s">{{ SCRIPT_STATUS_LABEL[s] }}</option>
        </select>
        <button class="btn btn-sm h-9" :disabled="loading" @click="loadScripts()">
          <AppIcon name="rotate-ccw" :size="15" /> Làm mới
        </button>
      </div>
    </div>

    <UTable :data="items" :columns="columns" :ui="TABLE_UI" :loading="loading" :meta="{ class: { tr: 'hover:bg-hover' } }">
      <template #productName-cell="{ row }">
        <div class="flex items-center gap-3">
          <ProductThumb :name="row.original.productName" :color="pickAccentColor(row.original.productName)" :size="38" />
          <div class="min-w-0">
            <button type="button" class="text-left font-medium hover:text-primary" @click="openEditor(row.original.id)">
              {{ row.original.productName }}
            </button>
            <div v-if="row.original.status === 'writing'" class="flex items-center gap-1 text-[0.8rem] text-primary">
              <AppIcon name="rotate-ccw" :size="13" class="animate-spin" /> AI đang viết…
            </div>
            <div v-if="row.original.failedReason" class="text-[0.85rem] text-bad">{{ row.original.failedReason }}</div>
          </div>
        </div>
      </template>

      <template #templateId-cell="{ row }">
        {{ row.original.templateId ? (templateNames.get(row.original.templateId) ?? '—') : '—' }}
      </template>

      <template #origin-cell="{ row }">
        <span class="badge bg-hover text-muted">{{ row.original.origin === 'ai' ? 'AI' : 'Tự viết' }}</span>
      </template>

      <template #status-cell="{ row }">
        <span class="flex flex-wrap items-center gap-1">
          <span class="badge" :class="STATUS_TONE[row.original.status]">{{ SCRIPT_STATUS_LABEL[row.original.status] }}</span>
          <span v-if="isNewScript(row.original)" class="badge bg-primary text-white">Mới</span>
        </span>
      </template>

      <template #updatedAt-cell="{ row }">
        {{ formatDateTime(row.original.updatedAt) }}
      </template>

      <template #actions-cell="{ row }">
        <button
          v-if="row.original.status === 'ready'"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="creatingId !== null"
          @click="createVideo(row.original)"
        >
          <AppIcon name="film" :size="15" :class="creatingId === row.original.id ? 'animate-pulse' : ''" />
          {{ creatingId === row.original.id ? 'Đang tạo…' : 'Tạo video' }}
        </button>
      </template>

      <template #loading>
        <span class="inline-flex items-center gap-2 text-muted">
          <AppIcon name="rotate-ccw" :size="16" class="animate-spin" /> Đang tải…
        </span>
      </template>

      <template #empty>
        <div class="flex flex-col items-center gap-3 text-center">
          <span class="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <AppIcon name="file-text" :size="26" />
          </span>
          <div>
            <p class="font-semibold text-fg">Chưa có kịch bản nào ở đây</p>
            <p class="mt-1 text-[0.9rem] text-muted">Giao AI viết cho nhiều sản phẩm cùng lúc, hoặc tự viết lời thoại theo định dạng.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm" @click="openEditor(null)">Tự viết</button>
            <button class="btn btn-primary btn-sm" @click="showAiDialog = true"><AppIcon name="sparkles" :size="15" /> AI viết kịch bản</button>
          </div>
        </div>
      </template>
    </UTable>

    <div v-if="cursor" class="border-t border-line px-5 py-3">
      <button class="btn btn-sm" :disabled="loading" @click="loadScripts(false)">Xem thêm</button>
    </div>
  </section>

  <AiScriptDialog :open="showAiDialog" @close="showAiDialog = false" @created="handleAiCreated" />
  <ScriptEditorDialog :open="editorOpen" :script-id="editorScriptId" @close="editorOpen = false" @changed="loadScripts(true, true)" />
</template>
