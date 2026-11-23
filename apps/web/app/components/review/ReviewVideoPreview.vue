<script setup lang="ts">
// Khung điện thoại 9:16 xem trước: nền theo màu sản phẩm, câu hook là cảnh đầu.
import type { Scene } from '~/types';

const props = defineProps<{ productName: string; scenes: Scene[] }>();

const totalSeconds = computed(() => props.scenes.reduce((sum, scene) => sum + estimateSceneSeconds(scene), 0));
const hook = computed(() => props.scenes[0]?.narration ?? 'Chưa có cảnh');
const gradient = computed(() => `linear-gradient(160deg, ${pickAccentColor(props.productName)}, #241a16 85%)`);
</script>

<template>
  <div class="relative mx-auto aspect-9/16 w-[210px] overflow-hidden rounded-[22px] border-[6px] border-[#241a16] bg-[#241a16] text-white">
    <div class="absolute inset-0" :style="{ background: gradient }" />
    <div class="absolute inset-x-3 top-3 flex items-center justify-between text-[0.72rem] opacity-80">
      <span class="truncate">{{ productName }}</span>
      <AppIcon name="volume-2" :size="13" />
    </div>
    <button
      class="absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-white/20 backdrop-blur"
      aria-label="Phát thử"
      @click="message.info('Bản xem trước video sẽ có ở M1 (render FFmpeg).')"
    >
      <AppIcon name="play" :size="18" />
    </button>
    <p class="absolute inset-x-3 bottom-14 text-center text-[0.9rem] leading-snug font-semibold [text-shadow:0_1px_4px_#0008]">
      {{ hook }}
    </p>
    <span class="absolute bottom-4 left-3 rounded-md bg-white px-2 py-1 text-[0.75rem] font-bold text-[#2c211c]">
      {{ scenes.length }} cảnh · {{ formatTimecode(totalSeconds) }}
    </span>
  </div>
</template>
