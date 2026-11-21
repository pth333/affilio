<script setup lang="ts">
import { AI_QUOTA, CHANNELS } from '~/data/mock';

const emit = defineEmits<{ menu: [] }>();
const route = useRoute();

// Tiêu đề lấy từ definePageMeta({ title }) của từng trang.
const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''));
const channelOptions = CHANNELS.filter((c) => c.status === 'active');
const selectedChannel = ref('all');
</script>

<template>
  <header class="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
    <button type="button" class="icon-btn lg:hidden" aria-label="Mở menu" @click="emit('menu')">
      <AppIcon name="menu" :size="20" />
    </button>

    <nav class="flex min-w-0 items-center gap-1.5 text-muted" aria-label="Breadcrumb">
      <span class="hidden sm:inline">Không gian làm việc</span>
      <AppIcon name="chevron-right" :size="15" class="hidden sm:block" />
      <span class="truncate font-semibold text-fg">{{ pageTitle }}</span>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <div class="relative hidden md:block">
        <select v-model="selectedChannel" class="field h-9 cursor-pointer appearance-none pr-8 font-medium" aria-label="Lọc theo kênh">
          <option value="all">Tất cả kênh</option>
          <option v-for="c in channelOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <AppIcon name="chevron-down" :size="15" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
      </div>

      <span class="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 font-medium" title="Lượt AI đã dùng hôm nay">
        <AppIcon name="zap" :size="15" class="text-primary" />
        {{ AI_QUOTA.used }} / {{ AI_QUOTA.limit }} <span class="text-muted">AI</span>
      </span>

      <button type="button" class="icon-btn relative" aria-label="Thông báo" @click="message.info('Bạn không có thông báo mới.')">
        <AppIcon name="bell" :size="19" />
        <span class="absolute top-2 right-2 size-2 rounded-full border-2 border-bg bg-bad" />
      </button>
    </div>
  </header>
</template>
