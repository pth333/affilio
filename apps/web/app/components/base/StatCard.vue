<script setup lang="ts">
// Thẻ chỉ số: nhãn, giá trị lớn, chú thích; slot mặc định để chèn biểu đồ nhỏ/thanh tiến độ.
defineProps<{ label: string; value: string | number; hint?: string; icon?: IconName; trend?: number }>();
</script>

<template>
  <div class="card flex flex-col p-5">
    <div class="flex items-center justify-between gap-2 text-muted">
      <span class="font-medium">{{ label }}</span>
      <AppIcon v-if="icon" :name="icon" :size="18" />
    </div>
    <div class="mt-3 flex items-baseline gap-2">
      <span class="text-[2rem] leading-none font-bold tracking-[-0.02em]">{{ value }}</span>
      <span v-if="trend !== undefined" class="badge" :class="trend >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'">
        <AppIcon :name="trend >= 0 ? 'trending-up' : 'arrow-right'" :size="13" />
        {{ formatPercent(trend, true) }}
      </span>
    </div>
    <p v-if="hint" class="mt-2 text-[0.9rem] text-muted">{{ hint }}</p>
    <div v-if="$slots.default" class="mt-auto pt-4">
      <slot />
    </div>
  </div>
</template>
