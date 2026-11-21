<script setup lang="ts">
// Điểm gợi ý AI (0–100): ≥85 xanh, ≥70 vàng, còn lại đỏ.
const props = defineProps<{ score: number }>();
const tone = computed(() => {
  if (props.score >= 85) return 'bg-ok-soft text-ok';
  if (props.score >= 70) return 'bg-warn-soft text-warn';
  return 'bg-bad-soft text-bad';
});
</script>

<template>
  <span class="badge tabular-nums" :class="tone" :title="`Điểm gợi ý AI: ${score}/100`">
    <AppIcon name="sparkles" :size="12" />
    {{ score }}
  </span>
</template>
