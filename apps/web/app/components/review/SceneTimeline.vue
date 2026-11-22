<script setup lang="ts">
// Dòng thời gian các cảnh: độ rộng theo thời lượng ước tính, bấm để nhảy tới cảnh.
import type { Scene } from '~/types';

const props = defineProps<{ scenes: Scene[] }>();
const emit = defineEmits<{ focus: [sceneId: string] }>();

const TONES = ['bg-primary text-white', 'bg-primary/75 text-white', 'bg-primary/50 text-white', 'bg-primary/30 text-fg'];

const items = computed(() => buildSceneTimeline(props.scenes));

function tone(index: number): string {
  return TONES[index % TONES.length] ?? '';
}
</script>

<template>
  <div>
    <p class="eyebrow mb-2">Timeline</p>
    <div class="flex h-10 overflow-hidden rounded-lg text-[0.72rem] font-medium" aria-label="Dòng thời gian các cảnh">
      <button
        v-for="item in items"
        :key="item.scene.id"
        class="flex min-w-0 items-center justify-center truncate border-r border-surface px-1 last:border-r-0"
        :class="tone(item.index)"
        :style="{ flexGrow: item.seconds }"
        :title="`${SCENE_ROLE_LABEL[item.scene.role] ?? item.scene.role} · ${formatTimecode(item.start)}–${formatTimecode(item.start + item.seconds)}`"
        @click="emit('focus', item.scene.id)"
      >
        {{ item.index + 1 }}
      </button>
    </div>
    <p class="mt-2 text-[0.85rem] text-muted">Bấm một đoạn để nhảy tới cảnh tương ứng.</p>
  </div>
</template>
