<script setup lang="ts">
import { CHANNELS } from '~/data/mock';
import type { Channel } from '~/types';

definePageMeta({ title: 'Kênh của tôi' });

const channels = ref<Channel[]>(CHANNELS.map((c) => ({ ...c })));
const tab = ref<Channel['status']>('active');
const visible = computed(() => channels.value.filter((c) => c.status === tab.value));
const counts = computed(() => ({
  active: channels.value.filter((c) => c.status === 'active').length,
  archived: channels.value.filter((c) => c.status === 'archived').length,
}));

function toggleChannelArchive(channel: Channel): void {
  channel.status = channel.status === 'active' ? 'archived' : 'active';
  message.success(channel.status === 'archived' ? `Đã lưu trữ kênh “${channel.name}”` : `Đã khôi phục kênh “${channel.name}”`);
}

function duplicateChannel(channel: Channel): void {
  channels.value.push({ ...channel, id: `${channel.id}-copy-${Date.now()}`, name: `${channel.name} (bản sao)`, pending: 0, published: 0 });
  message.success(`Đã nhân bản kênh “${channel.name}”`);
}
</script>

<template>
  <PageHeader title="Kênh của tôi" description="Mỗi kênh có giọng điệu và định hướng nội dung riêng — AI sẽ bám theo khi tạo video.">
    <template #actions>
      <button class="btn btn-primary" @click="message.info('Kết nối kênh mới sẽ sớm khả dụng.')">
        <AppIcon name="plus" :size="17" /> Thêm kênh
      </button>
    </template>
  </PageHeader>

  <div class="tabs mb-5" role="tablist">
    <button role="tab" class="tab" :class="{ 'tab-active': tab === 'active' }" :aria-selected="tab === 'active'" @click="tab = 'active'">
      Đang hoạt động <span class="ml-1 text-muted">{{ counts.active }}</span>
    </button>
    <button role="tab" class="tab" :class="{ 'tab-active': tab === 'archived' }" :aria-selected="tab === 'archived'" @click="tab = 'archived'">
      Đã lưu trữ <span class="ml-1 text-muted">{{ counts.archived }}</span>
    </button>
  </div>

  <div v-if="visible.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <article v-for="c in visible" :key="c.id" class="card flex flex-col p-5">
      <div class="flex items-start gap-3">
        <ProductThumb :name="c.name" :color="c.color" :size="46" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[1.05rem] font-semibold">{{ c.name }}</p>
          <p class="text-[0.85rem] text-muted">{{ c.handle }}</p>
        </div>
        <span class="badge bg-hover text-muted">{{ c.tag }}</span>
      </div>

      <div class="mt-5 rounded-lg bg-surface-2 p-3.5 ring-1 ring-line">
        <p class="eyebrow text-[0.72rem]">Series hiện tại</p>
        <p class="mt-1 font-medium">{{ c.series }}</p>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-3 text-[0.9rem]">
        <div>
          <p class="text-muted">Người theo dõi</p>
          <p class="font-semibold">{{ formatCompact(c.followers) }}</p>
        </div>
        <div>
          <p class="text-muted">Chờ duyệt</p>
          <p class="font-semibold">{{ c.pending }}</p>
        </div>
        <div>
          <p class="text-muted">Đã đăng</p>
          <p class="font-semibold">{{ c.published }}</p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button class="btn btn-sm" @click="message.info('Trình chỉnh định hướng kênh đang được xây dựng.')">
          <AppIcon name="sliders-horizontal" :size="15" /> Chỉnh định hướng
        </button>
        <button class="btn btn-sm btn-ghost ml-auto" @click="duplicateChannel(c)"><AppIcon name="copy" :size="15" /> Nhân bản</button>
        <button class="btn btn-sm btn-ghost" @click="toggleChannelArchive(c)">
          <AppIcon :name="c.status === 'active' ? 'download' : 'rotate-ccw'" :size="15" />
          {{ c.status === 'active' ? 'Lưu trữ' : 'Khôi phục' }}
        </button>
      </div>
    </article>
  </div>
  <p v-else class="card p-10 text-center text-muted">Chưa có kênh nào trong mục này.</p>
</template>
