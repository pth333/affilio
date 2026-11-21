<script setup lang="ts">
import { DRAFTS } from '~/data/mock';
import type { Draft } from '~/types';

definePageMeta({ title: 'Hộp thư duyệt' });

const route = useRoute();
const drafts = ref<Draft[]>(DRAFTS.map((d) => ({ ...d })));
const filter = ref<'all' | 'high' | 'warn'>('all');
const selectedId = ref(typeof route.query.id === 'string' ? route.query.id : (drafts.value[0]?.id ?? ''));
const feedback = ref('');
const showFeedback = ref(false);

const filtered = computed(() =>
  drafts.value.filter((d) => {
    if (filter.value === 'high') return d.score >= 85;
    if (filter.value === 'warn') return d.checks.some((c) => !c.passed);
    return true;
  }),
);
const current = computed(() => drafts.value.find((d) => d.id === selectedId.value) ?? filtered.value[0] ?? null);
const passedChecks = computed(() => current.value?.checks.filter((c) => c.passed).length ?? 0);

/** Bỏ bản nháp đã xử lý khỏi danh sách và chuyển sang bản kế tiếp. */
function next(id: string): void {
  const idx = drafts.value.findIndex((d) => d.id === id);
  drafts.value.splice(idx, 1);
  selectedId.value = drafts.value[Math.min(idx, drafts.value.length - 1)]?.id ?? '';
  showFeedback.value = false;
  feedback.value = '';
}

function approve(): void {
  if (!current.value) return;
  next(current.value.id);
  message.success('Đã duyệt video. Video đã được chuyển sang mục Đăng tải.');
}

function reject(): void {
  if (!current.value) return;
  next(current.value.id);
  message.warning('Đã từ chối bản nháp. AI sẽ rút kinh nghiệm cho lần sau.');
}

function sendFeedback(): void {
  if (!current.value) return;
  if (!feedback.value.trim()) {
    message.warning('Hãy nhập góp ý trước khi gửi.');
    return;
  }
  next(current.value.id);
  message.success('AI đã nhận ghi chú và đang chỉnh sửa bản nháp.');
}

/** Phím tắt: A duyệt, R từ chối, N góp ý (bỏ qua khi đang gõ). */
function onKey(e: KeyboardEvent): void {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'a') approve();
  else if (key === 'r') reject();
  else if (key === 'n') showFeedback.value = true;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function formatSeconds(s: number): string {
  return `0:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <PageHeader title="Hộp thư duyệt" :description="`${drafts.length} bản nháp đang chờ. Duyệt nhanh bằng phím A / R / N.`">
    <template #actions>
      <button class="btn" @click="message.info('Lịch sử phiên bản sẽ sớm khả dụng.')"><AppIcon name="history" :size="16" /> Lịch sử phiên bản</button>
    </template>
  </PageHeader>

  <div v-if="!current" class="card grid place-items-center gap-3 p-14 text-center">
    <AppIcon name="circle-check" :size="40" class="text-ok" />
    <p class="text-[1.15rem] font-semibold">Đã duyệt hết!</p>
    <p class="text-muted">Không còn bản nháp nào chờ bạn. AI sẽ báo khi có video mới.</p>
    <NuxtLink to="/publishing" class="btn btn-primary mt-2">Sang mục Đăng tải</NuxtLink>
  </div>

  <div v-else class="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
    <!-- Cột 1: danh sách bản nháp -->
    <aside class="card flex flex-col overflow-hidden">
      <div class="border-b border-line p-3">
        <div class="tabs w-full">
          <button class="tab flex-1 px-2" :class="{ 'tab-active': filter === 'all' }" @click="filter = 'all'">Tất cả</button>
          <button class="tab flex-1 px-2" :class="{ 'tab-active': filter === 'high' }" @click="filter = 'high'">Điểm cao</button>
          <button class="tab flex-1 px-2" :class="{ 'tab-active': filter === 'warn' }" @click="filter = 'warn'">Cần xem</button>
        </div>
      </div>
      <ul class="max-h-[640px] overflow-y-auto">
        <li v-for="d in filtered" :key="d.id">
          <button
            class="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors"
            :class="d.id === current.id ? 'bg-primary-soft' : 'hover:bg-hover'"
            @click="selectedId = d.id"
          >
            <ProductThumb :name="d.productName" :color="d.color" :size="38" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ d.productName }}</span>
              <span class="block truncate text-[0.82rem] text-muted">{{ d.channelName }} · {{ d.createdAt }}</span>
            </span>
            <ScoreBadge :score="d.score" />
          </button>
        </li>
        <li v-if="filtered.length === 0" class="p-6 text-center text-muted">Không có bản nháp phù hợp.</li>
      </ul>
    </aside>

    <!-- Cột 2: xem trước + kịch bản -->
    <section class="card p-5">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <h2 class="text-[1.15rem] font-bold">{{ current.productName }}</h2>
        <span class="badge bg-hover text-muted">{{ current.channelName }}</span>
        <span class="badge bg-hover text-muted">{{ current.duration }} giây</span>
      </div>

      <div class="grid gap-6 md:grid-cols-[230px_1fr] xl:grid-cols-1 2xl:grid-cols-[230px_1fr]">
        <!-- Điện thoại 9:16 -->
        <div class="relative mx-auto aspect-9/16 w-[230px] overflow-hidden rounded-[22px] border-[6px] border-[#1f1d27] bg-[#1f1d27] text-white">
          <div class="absolute inset-0" :style="{ background: `linear-gradient(160deg, ${current.color}, #1f1d27 85%)` }" />
          <div class="absolute inset-x-3 top-3 flex items-center justify-between text-[0.75rem] opacity-80">
            <span>{{ current.channelName }}</span>
            <AppIcon name="volume-2" :size="14" />
          </div>
          <button class="absolute top-1/2 left-1/2 grid size-12 -translate-1/2 place-items-center rounded-full bg-white/20 backdrop-blur" aria-label="Phát thử" @click="message.info('Bản xem trước video sẽ có khi render xong.')">
            <AppIcon name="play" :size="20" />
          </button>
          <p class="absolute inset-x-3 bottom-16 text-center text-[0.95rem] leading-snug font-semibold [text-shadow:0_1px_4px_#0008]">
            {{ current.hook }}
          </p>
          <span class="absolute bottom-4 left-3 rounded-md bg-white px-2 py-1 text-[0.8rem] font-bold text-[#292a36]">{{ formatCurrency(current.price) }}</span>
        </div>

        <!-- Kịch bản theo cảnh -->
        <div>
          <p class="eyebrow mb-3">Kịch bản</p>
          <ol class="space-y-3">
            <li v-for="s in current.scenes" :key="s.role" class="rounded-lg border border-line p-3.5">
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="font-semibold text-primary-strong">{{ s.role }}</span>
                <span class="text-[0.8rem] text-muted tabular-nums">{{ formatSeconds(s.start) }} – {{ formatSeconds(s.end) }}</span>
              </div>
              <p>{{ s.text }}</p>
            </li>
          </ol>
        </div>
      </div>

      <!-- Dòng thời gian -->
      <div class="mt-5 flex h-8 overflow-hidden rounded-lg text-[0.75rem] font-medium" aria-label="Dòng thời gian các cảnh">
        <div
          v-for="(s, i) in current.scenes"
          :key="s.role"
          class="flex min-w-0 items-center justify-center truncate border-r border-surface px-1 last:border-r-0"
          :class="['bg-primary/80 text-white', 'bg-primary/55 text-white', 'bg-primary/35', 'bg-primary/20'][i]"
          :style="{ flex: s.end - s.start }"
        >
          {{ s.role }}
        </div>
      </div>
    </section>

    <!-- Cột 3: kiểm tra + hành động -->
    <aside class="flex flex-col gap-5">
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <p class="font-semibold">Điểm gợi ý AI</p>
          <ScoreBadge :score="current.score" />
        </div>
        <ProgressBar :value="current.score" class="mt-3" label="Điểm gợi ý AI" />
      </div>

      <div class="card p-5">
        <div class="mb-3 flex items-center justify-between">
          <p class="font-semibold">Kiểm tra nguyên tắc</p>
          <span class="text-muted">{{ passedChecks }}/{{ current.checks.length }}</span>
        </div>
        <ul class="space-y-2">
          <li v-for="c in current.checks" :key="c.label" class="flex items-start gap-2">
            <AppIcon :name="c.passed ? 'circle-check' : 'triangle-alert'" :size="17" class="mt-0.5" :class="c.passed ? 'text-ok' : 'text-warn'" />
            <span :class="c.passed ? '' : 'text-warn'">{{ c.label }}</span>
          </li>
        </ul>
      </div>

      <div class="card p-5">
        <p class="mb-3 font-semibold">Quyết định</p>
        <div v-if="showFeedback" class="mb-3">
          <textarea
            v-model="feedback"
            rows="3"
            maxlength="2000"
            class="field h-auto w-full py-2"
            placeholder="Ví dụ: Mở đầu cần nhắc giá sớm hơn…"
          />
          <div class="mt-2 flex gap-2">
            <button class="btn btn-sm btn-primary" @click="sendFeedback">Gửi góp ý</button>
            <button class="btn btn-sm btn-ghost" @click="showFeedback = false">Huỷ</button>
          </div>
        </div>
        <div class="grid gap-2">
          <button class="btn btn-ok" @click="approve"><AppIcon name="check" :size="16" /> Duyệt video <kbd class="kbd">A</kbd></button>
          <button class="btn" @click="showFeedback = true">
            <AppIcon name="message-square" :size="16" /> Góp ý cho AI <kbd class="kbd">N</kbd>
          </button>
          <button class="btn btn-bad" @click="reject"><AppIcon name="x" :size="16" /> Từ chối <kbd class="kbd">R</kbd></button>
        </div>
      </div>
    </aside>
  </div>
</template>
