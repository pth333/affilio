<script setup lang="ts">
// Popup tạo video, hai cách:
//   - "Từ kịch bản có sẵn": chọn một hoặc nhiều kịch bản đã sẵn sàng → dựng video ngay (server kiểm luật lại).
//   - "AI viết kịch bản mới": giao AI viết ở nền (AiScriptForm); xong người dùng xem ở mục Kịch bản rồi mới tạo video.
import { CHANNELS } from '~/data/mock';
import type { Channel, ScriptListItem } from '~/types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [number] }>();

type Tab = 'existing' | 'ai';

/** Giới hạn số video tạo một lần để không dồn quá nhiều workflow cùng lúc. */
const MAX_SCRIPTS = 20;

const channels = CHANNELS.filter((channel) => channel.status === 'active');
const channelId = ref(channels[0]?.id ?? '');
const tab = ref<Tab>('existing');
const scripts = ref<ScriptListItem[]>([]);
const loadingScripts = ref(false);
const keyword = ref('');
const selectedIds = ref<string[]>([]);
const submitting = ref(false);
const aiBusy = ref(false);

const busy = computed(() => submitting.value || aiBusy.value);
const selectedChannel = computed<Channel | null>(() => channels.find((channel) => channel.id === channelId.value) ?? null);
const reachedLimit = computed(() => selectedIds.value.length >= MAX_SCRIPTS);
const filteredScripts = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return scripts.value;
  return scripts.value.filter((item) => item.productName.toLowerCase().includes(query));
});

function toggleScript(id: string): void {
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter((item) => item !== id);
  else if (!reachedLimit.value) selectedIds.value = [...selectedIds.value, id];
}

async function loadScripts(): Promise<void> {
  loadingScripts.value = true;
  try {
    const page = await scriptApi.getScripts({ status: 'ready', limit: 100 });
    scripts.value = page.items;
  } catch {
    // interceptor đã hiện thông báo lỗi
  } finally {
    loadingScripts.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    tab.value = 'existing';
    keyword.value = '';
    selectedIds.value = [];
    void loadScripts();
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  const chosen = scripts.value.filter((item) => selectedIds.value.includes(item.id));
  if (chosen.length === 0 || submitting.value) return;
  submitting.value = true;
  try {
    // Tự báo lỗi gộp (silent) thay vì để interceptor bắn từng toast một.
    const results = await Promise.allSettled(
      chosen.map((item) => {
        if (!item.currentVersionId) return Promise.reject(new Error('Kịch bản chưa có phiên bản'));
        return scriptApi.createVideo(item.id, { versionId: item.currentVersionId }, { silent: true });
      }),
    );
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected' ? [`${chosen[index]?.productName ?? ''}: ${getErrorMessage(result.reason)}`] : [],
    );
    const created = results.length - failures.length;
    if (failures.length === 0) {
      message.success(`Đã tạo ${created} video — AI đang dựng preview, xong sẽ vào Hộp thư duyệt.`);
    } else {
      console.warn('[create-video] một số kịch bản tạo video lỗi', failures);
      message.warning(`Tạo được ${created}/${results.length} video. Lỗi: ${failures.join(' · ')}`);
    }
    if (created > 0) {
      emit('created', created);
      emit('close');
    } else {
      // Giữ popup mở để người dùng bỏ chọn kịch bản lỗi; tải lại vì có thể kịch bản vừa đổi phiên bản.
      await loadScripts();
    }
  } finally {
    submitting.value = false;
  }
}

function handleAiSubmitted(): void {
  // Chưa có video nào được tạo — kịch bản AI viết xong sẽ ở mục Kịch bản.
  emit('close');
}
</script>

<template>
  <AppModal
    :open="props.open"
    :busy="busy"
    :width="820"
    eyebrow="Video mới"
    title="Tạo video"
    description="Dựng video từ kịch bản có sẵn, hoặc giao AI viết kịch bản mới rồi duyệt ở mục Kịch bản trước khi tạo video."
    @close="emit('close')"
  >
    <div class="space-y-5">
      <!-- Kênh đăng video -->
      <section>
        <label class="form-label" for="video-channel">Kênh sáng tạo</label>
        <div class="relative">
          <select id="video-channel" v-model="channelId" class="field h-11 w-full appearance-none pr-9 font-medium" :disabled="busy">
            <option v-for="channel in channels" :key="channel.id" :value="channel.id">{{ channel.name }} · {{ channel.handle }}</option>
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

      <div class="flex gap-1 rounded-xl bg-hover p-1" role="tablist">
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-lg px-3 py-2 text-[0.9rem] font-semibold transition-colors"
          :class="tab === 'existing' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'"
          :aria-selected="tab === 'existing'"
          :disabled="busy"
          @click="tab = 'existing'"
        >
          Từ kịch bản có sẵn
        </button>
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-lg px-3 py-2 text-[0.9rem] font-semibold transition-colors"
          :class="tab === 'ai' ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'"
          :aria-selected="tab === 'ai'"
          :disabled="busy"
          @click="tab = 'ai'"
        >
          AI viết kịch bản mới
        </button>
      </div>

      <!-- Từ kịch bản có sẵn -->
      <section v-if="tab === 'existing'">
        <div class="flex items-baseline justify-between gap-2">
          <p class="form-label mb-0">Kịch bản sẵn sàng</p>
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
        <p class="mb-2 text-[0.82rem] text-muted">Chọn nhiều kịch bản (tối đa {{ MAX_SCRIPTS }}) — mỗi kịch bản một video.</p>
        <div class="relative mb-2">
          <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input v-model="keyword" class="field w-full pl-9" type="search" placeholder="Tìm theo tên sản phẩm…" />
        </div>
        <p v-if="loadingScripts && scripts.length === 0" class="py-6 text-center text-[0.85rem] text-muted">Đang tải kịch bản…</p>
        <ul v-else class="max-h-[300px] space-y-2 overflow-y-auto pr-1">
          <li v-for="item in filteredScripts" :key="item.id">
            <label
              class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
              :class="selectedIds.includes(item.id) ? 'border-primary bg-primary-soft/60' : 'border-line hover:border-primary/40 hover:bg-hover'"
            >
              <input
                class="size-5 shrink-0 accent-(--primary)"
                type="checkbox"
                :checked="selectedIds.includes(item.id)"
                :disabled="submitting || (reachedLimit && !selectedIds.includes(item.id))"
                @change="toggleScript(item.id)"
              />
              <ProductThumb :name="item.productName" :color="pickAccentColor(item.productName)" :size="40" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ item.productName }}</span>
                <span class="block truncate text-[0.82rem] text-muted">
                  {{ item.origin === 'ai' ? 'AI viết' : 'Tự viết' }} · đã tạo {{ item.videoCount }} video · {{ formatDateTime(item.updatedAt) }}
                </span>
              </span>
              <span v-if="isNewScript(item)" class="badge bg-primary text-white">Mới</span>
            </label>
          </li>
          <li v-if="filteredScripts.length === 0" class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">
            {{ scripts.length === 0 ? 'Chưa có kịch bản nào sẵn sàng.' : 'Không tìm thấy kịch bản phù hợp.' }}
            <button type="button" class="font-semibold text-primary hover:underline" @click="tab = 'ai'">Giao AI viết</button>
            hoặc
            <NuxtLink to="/scripts" class="font-semibold text-primary hover:underline">tự viết ở mục Kịch bản</NuxtLink>.
          </li>
        </ul>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p class="text-[0.88rem] text-muted">
            {{ selectedIds.length ? `${selectedIds.length} video sẽ được tạo.` : 'Chọn ít nhất một kịch bản.' }}
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn" :disabled="submitting" @click="emit('close')">Huỷ</button>
            <button type="button" class="btn btn-primary" :disabled="submitting || selectedIds.length === 0" @click="submit">
              <AppIcon name="film" :size="16" :class="submitting ? 'animate-pulse' : ''" />
              {{ submitting ? 'Đang tạo…' : `Tạo video (${selectedIds.length})` }}
            </button>
          </div>
        </div>
      </section>

      <!-- AI viết kịch bản mới -->
      <AiScriptForm v-else v-model:busy="aiBusy" @cancel="emit('close')" @submitted="handleAiSubmitted" />
    </div>
  </AppModal>
</template>
