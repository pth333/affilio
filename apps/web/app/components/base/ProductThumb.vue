<script setup lang="ts">
// Ảnh đại diện tạm cho sản phẩm/kênh: chữ cái đầu trên nền màu nhạt.
withDefaults(defineProps<{ name: string; color: string; size?: number }>(), { size: 40 });
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-lg font-bold"
    :style="{ width: `${size}px`, height: `${size}px`, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, fontSize: `${size * 0.4}px` }"
    aria-hidden="true"
  >
    {{ initials(name, 1) }}
  </span>
</template>
