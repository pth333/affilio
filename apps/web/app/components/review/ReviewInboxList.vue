<script setup lang="ts">
// Cột trái Hộp thư duyệt: danh sách video đang chờ duyệt, chọn video để xem/sửa.
import type { VideoListItem } from '~/types';

defineProps<{ videos: VideoListItem[]; selectedId: string; count: number; loading: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <aside class="card flex flex-col overflow-hidden">
    <div class="flex items-center justify-between border-b border-line px-4 py-3">
      <p class="font-semibold">Chờ duyệt</p>
      <span class="badge bg-primary-soft text-primary-strong">{{ count }}</span>
    </div>
    <ul class="max-h-[640px] overflow-y-auto">
      <li v-for="video in videos" :key="video.id">
        <button
          class="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors"
          :class="video.id === selectedId ? 'bg-primary-soft' : 'hover:bg-hover'"
          @click="emit('select', video.id)"
        >
          <ProductThumb :name="video.productName" :color="pickAccentColor(video.productName)" :size="38" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ video.productName }}</span>
            <span class="block truncate text-[0.82rem] text-muted">{{ formatDateTime(video.updatedAt) }}</span>
          </span>
        </button>
      </li>
      <li v-if="videos.length === 0" class="p-6 text-center text-muted">
        {{ loading ? 'Đang tải…' : 'Không có video chờ duyệt.' }}
      </li>
    </ul>
  </aside>
</template>
