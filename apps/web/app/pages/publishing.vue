<script setup lang="ts">
import { PERFORMANCE, PUBLISH_QUEUE } from '~/data/mock';
import type { PublishItem } from '~/types';

definePageMeta({ title: 'Đăng tải & hiệu quả' });

const tab = ref<'ready' | 'stats'>('ready');
const queue = ref<PublishItem[]>(PUBLISH_QUEUE.map((p) => ({ ...p })));
const selectedId = ref(queue.value[0]?.id ?? '');
const current = computed(() => queue.value.find((p) => p.id === selectedId.value) ?? queue.value[0] ?? null);

// ── Checklist trước khi đăng
const CHECKLIST = ['Đã tải video về máy', 'Đã dán caption và hashtag', 'Đã gắn link affiliate vào giỏ hàng / bio'];
const checked = ref<boolean[]>(CHECKLIST.map(() => false));
const postUrl = ref('');
const canConfirm = computed(() => checked.value.every(Boolean) && /^https?:\/\/\S+$/.test(postUrl.value.trim()));

watch(selectedId, () => {
  checked.value = CHECKLIST.map(() => false);
  postUrl.value = '';
});

async function copy(text: string): Promise<void> {
  if (await copyToClipboard(text)) message.success('Đã sao chép vào bộ nhớ tạm');
  else message.error('Trình duyệt chưa cho phép sao chép. Hãy sao chép thủ công.');
}

function confirmPosted(): void {
  if (!current.value || !canConfirm.value) return;
  const id = current.value.id;
  queue.value = queue.value.filter((p) => p.id !== id);
  selectedId.value = queue.value[0]?.id ?? '';
  message.success('Đã ghi nhận video đã đăng. Nhớ cập nhật số liệu sau 24 giờ nhé.');
}

// ── Cập nhật số liệu
type Checkpoint = '1h' | '24h' | '7d';
const CHECKPOINTS: { key: Checkpoint; label: string }[] = [
  { key: '1h', label: '1 giờ' },
  { key: '24h', label: '24 giờ' },
  { key: '7d', label: '7 ngày' },
];
const checkpoint = ref<Checkpoint>('24h');
const metrics = reactive({ views: 0, completion: 0, clicks: 0 });

function saveMetrics(): void {
  if (metrics.views < 0 || metrics.clicks < 0 || metrics.completion < 0 || metrics.completion > 100) {
    message.warning('Số liệu không hợp lệ. Tỉ lệ xem hết phải từ 0 đến 100%.');
    return;
  }
  const label = CHECKPOINTS.find((c) => c.key === checkpoint.value)?.label ?? '';
  message.success(`Đã lưu số liệu ${label}.`);
}

const totals = computed(() => ({
  views: PERFORMANCE.reduce((s, r) => s + r.views, 0),
  clicks: PERFORMANCE.reduce((s, r) => s + r.clicks, 0),
  orders: PERFORMANCE.reduce((s, r) => s + r.orders, 0),
  revenue: PERFORMANCE.reduce((s, r) => s + r.revenue, 0),
}));
</script>

<template>
  <PageHeader title="Đăng tải & hiệu quả" description="Tải gói nội dung, đăng lên kênh và ghi lại số liệu để AI học cách làm video tốt hơn.">
    <template #actions>
      <button class="btn" @click="message.info('Đang chuẩn bị file xuất dữ liệu…')"><AppIcon name="download" :size="16" /> Xuất dữ liệu</button>
    </template>
  </PageHeader>

  <div class="tabs mb-5" role="tablist">
    <button role="tab" class="tab" :class="{ 'tab-active': tab === 'ready' }" :aria-selected="tab === 'ready'" @click="tab = 'ready'">
      Sẵn sàng đăng <span class="ml-1 text-muted">{{ queue.length }}</span>
    </button>
    <button role="tab" class="tab" :class="{ 'tab-active': tab === 'stats' }" :aria-selected="tab === 'stats'" @click="tab = 'stats'">
      Phân tích hiệu quả
    </button>
  </div>

  <!-- Tab: Sẵn sàng đăng -->
  <template v-if="tab === 'ready'">
    <div v-if="!current" class="card grid place-items-center gap-2 p-14 text-center">
      <AppIcon name="circle-check" :size="40" class="text-ok" />
      <p class="text-[1.15rem] font-semibold">Không còn video chờ đăng</p>
      <NuxtLink to="/review" class="btn btn-primary mt-2">Về hộp thư duyệt</NuxtLink>
    </div>

    <div v-else class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section class="card p-5">
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="p in queue"
            :key="p.id"
            class="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
            :class="p.id === current.id ? 'border-primary bg-primary-soft' : 'border-line hover:bg-hover'"
            @click="selectedId = p.id"
          >
            <ProductThumb :name="p.productName" :color="p.color" :size="28" />
            <span class="max-w-44 truncate font-medium">{{ p.productName }}</span>
          </button>
        </div>

        <p class="eyebrow mb-1.5">Caption</p>
        <div class="flex items-start gap-2 rounded-lg border border-line p-3.5">
          <p class="flex-1">{{ current.caption }}</p>
          <button class="icon-btn size-8" aria-label="Sao chép caption" @click="copy(current.caption)"><AppIcon name="copy" :size="16" /></button>
        </div>

        <p class="eyebrow mt-5 mb-1.5">Hashtag</p>
        <div class="flex items-start gap-2 rounded-lg border border-line p-3.5">
          <p class="flex flex-1 flex-wrap gap-1.5">
            <span v-for="h in current.hashtags" :key="h" class="badge bg-primary-soft text-primary-strong">{{ h }}</span>
          </p>
          <button class="icon-btn size-8" aria-label="Sao chép hashtag" @click="copy(current.hashtags.join(' '))"><AppIcon name="copy" :size="16" /></button>
        </div>

        <p class="eyebrow mt-5 mb-1.5">Link affiliate</p>
        <div class="flex items-center gap-2 rounded-lg border border-line p-3.5">
          <AppIcon name="link" :size="16" class="text-muted" />
          <p class="flex-1 truncate text-primary">{{ current.affiliateUrl }}</p>
          <button class="icon-btn size-8" aria-label="Sao chép link" @click="copy(current.affiliateUrl)"><AppIcon name="copy" :size="16" /></button>
        </div>

        <button class="btn btn-primary mt-6" @click="message.info('Gói nội dung sẽ tải được khi video render xong.')">
          <AppIcon name="download" :size="16" /> Tải gói nội dung đăng tải
        </button>
      </section>

      <aside class="flex flex-col gap-5">
        <div class="card p-5">
          <p class="mb-3 font-semibold">Trước khi đăng</p>
          <label v-for="(item, i) in CHECKLIST" :key="item" class="flex cursor-pointer items-start gap-2.5 py-1.5">
            <input v-model="checked[i]" type="checkbox" class="mt-1 size-4 accent-(--primary)" />
            <span>{{ item }}</span>
          </label>
          <label class="mt-3 block">
            <span class="mb-1.5 block text-[0.9rem] text-muted">Link bài đăng</span>
            <input v-model="postUrl" type="url" class="field w-full" placeholder="https://www.tiktok.com/@…/video/…" />
          </label>
          <button class="btn btn-ok mt-4 w-full" :disabled="!canConfirm" @click="confirmPosted">
            <AppIcon name="check" :size="16" /> Xác nhận đã đăng
          </button>
        </div>

        <div class="card p-5">
          <p class="mb-3 font-semibold">Cập nhật số liệu</p>
          <div class="tabs mb-4 w-full">
            <button v-for="c in CHECKPOINTS" :key="c.key" class="tab flex-1" :class="{ 'tab-active': checkpoint === c.key }" @click="checkpoint = c.key">
              {{ c.label }}
            </button>
          </div>
          <form class="grid gap-3" @submit.prevent="saveMetrics">
            <label>
              <span class="mb-1 block text-[0.9rem] text-muted">Lượt xem</span>
              <input v-model.number="metrics.views" type="number" min="0" class="field w-full" />
            </label>
            <label>
              <span class="mb-1 block text-[0.9rem] text-muted">Tỉ lệ xem hết (%)</span>
              <input v-model.number="metrics.completion" type="number" min="0" max="100" step="0.1" class="field w-full" />
            </label>
            <label>
              <span class="mb-1 block text-[0.9rem] text-muted">Lượt nhấp link</span>
              <input v-model.number="metrics.clicks" type="number" min="0" class="field w-full" />
            </label>
            <button class="btn mt-1">Lưu số liệu {{ CHECKPOINTS.find((c) => c.key === checkpoint)?.label }}</button>
          </form>
        </div>
      </aside>
    </div>
  </template>

  <!-- Tab: Phân tích hiệu quả -->
  <template v-else>
    <section class="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Tổng lượt xem" :value="formatCompact(totals.views)" icon="play" />
      <StatCard label="Lượt nhấp link" :value="formatNumber(totals.clicks)" icon="link" />
      <StatCard label="Đơn hàng" :value="formatNumber(totals.orders)" icon="package" />
      <StatCard label="Hoa hồng ước tính" :value="formatCurrency(totals.revenue)" icon="trending-up" />
    </section>
    <section class="card overflow-x-auto">
      <table class="w-full min-w-[640px] border-collapse">
        <thead>
          <tr class="table-head border-b border-line">
            <th class="px-5 py-3">Kênh</th>
            <th class="px-5 py-3 text-right">Lượt xem</th>
            <th class="px-5 py-3 text-right">Xem hết</th>
            <th class="px-5 py-3 text-right">Nhấp link</th>
            <th class="px-5 py-3 text-right">Đơn</th>
            <th class="px-5 py-3 text-right">Hoa hồng</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="r in PERFORMANCE" :key="r.channel" class="border-b border-line last:border-b-0 hover:bg-hover">
            <td class="px-5 py-3.5 font-medium">{{ r.channel }}</td>
            <td class="px-5 py-3.5 text-right">{{ formatCompact(r.views) }}</td>
            <td class="px-5 py-3.5 text-right">{{ formatPercent(r.completion) }}</td>
            <td class="px-5 py-3.5 text-right">{{ formatNumber(r.clicks) }}</td>
            <td class="px-5 py-3.5 text-right">{{ formatNumber(r.orders) }}</td>
            <td class="px-5 py-3.5 text-right font-semibold">{{ formatCurrency(r.revenue) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
