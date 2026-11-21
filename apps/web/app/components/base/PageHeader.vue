<script setup lang="ts">
// Đầu trang: dòng nhỏ (eyebrow) + tiêu đề + mô tả; slot `actions` cho nút bên phải.
defineProps<{ title: string; eyebrow?: string; description?: string }>();
</script>

<template>
  <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mb-1.5">{{ eyebrow }}</p>
      <h1 class="flex items-center gap-2 text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">
        {{ title }}
        <slot name="title-suffix" />
      </h1>
      <p v-if="description" class="mt-1.5 max-w-2xl text-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
