<script setup lang="ts">
const props = defineProps<{ value: number; max?: number; label?: string }>();
const percent = computed(() => clamp((props.value / (props.max ?? 100)) * 100, 0, 100));
</script>

<template>
  <div
    class="h-2 w-full overflow-hidden rounded-full bg-hover"
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    :aria-valuemax="max ?? 100"
    :aria-label="label"
  >
    <div class="h-full rounded-full bg-primary transition-[width] duration-500" :style="{ width: `${percent}%` }" />
  </div>
</template>
