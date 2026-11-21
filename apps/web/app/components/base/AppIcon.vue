<script setup lang="ts">
// Icon SVG từ utils/icons.ts. Màu theo `currentColor` → đổi bằng class text-*.
const props = withDefaults(defineProps<{ name: IconName; size?: number | string; strokeWidth?: number | string }>(), {
  size: 18,
  strokeWidth: 2,
});
const body = computed(() => ICONS[props.name]);
</script>

<template>
  <!-- v-html an toàn: nội dung là hằng số trong code, không phải dữ liệu người dùng. -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="shrink-0"
    aria-hidden="true"
    v-html="body"
  />
</template>
