<script setup lang="ts">
// Biểu đồ cột mini; cột cuối được tô đậm.
const props = withDefaults(defineProps<{ values: number[]; height?: number }>(), { height: 40 });
const max = computed(() => Math.max(1, ...props.values));
</script>

<template>
  <div class="flex items-end gap-1.5" :style="{ height: `${height}px` }" role="img" :aria-label="`Biểu đồ: ${values.join(', ')}`">
    <span
      v-for="(v, i) in values"
      :key="i"
      class="flex-1 rounded-[3px]"
      :class="i === values.length - 1 ? 'bg-primary' : 'bg-primary/25'"
      :style="{ height: `${Math.max(8, (v / max) * 100)}%` }"
    />
  </div>
</template>
