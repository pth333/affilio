<script setup lang="ts">
// Ảnh đại diện tạm cho sản phẩm/kênh: dùng `imageUrl` nếu có, không thì chữ cái đầu trên nền màu nhạt.
withDefaults(defineProps<{ name: string; color: string; size?: number; imageUrl?: string | null }>(), {
  size: 40,
  imageUrl: null,
});
</script>

<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    :alt="name"
    class="shrink-0 rounded-lg border border-line object-cover"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
  <span
    v-else
    class="grid shrink-0 place-items-center rounded-lg font-bold"
    :style="{ width: `${size}px`, height: `${size}px`, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, fontSize: `${size * 0.4}px` }"
    aria-hidden="true"
  >
    {{ getInitials(name, 1) }}
  </span>
</template>
