<script setup lang="ts">
import { STATUS_LABEL, type VideoStatus } from '~/types';

const props = defineProps<{ status: VideoStatus }>();

// Viết đủ tên class (không ghép chuỗi) để Tailwind quét được.
const TONE: Partial<Record<VideoStatus, string>> = {
  pending_review: 'bg-primary-soft text-primary-strong',
  approved: 'bg-ok-soft text-ok',
  ready: 'bg-ok-soft text-ok',
  published: 'bg-ok-soft text-ok',
  needs_changes: 'bg-warn-soft text-warn',
  revising: 'bg-warn-soft text-warn',
  failed: 'bg-bad-soft text-bad',
  rejected: 'bg-bad-soft text-bad',
  rejected_auto: 'bg-bad-soft text-bad',
};
const tone = computed(() => TONE[props.status] ?? 'bg-hover text-muted');
</script>

<template>
  <span class="badge" :class="tone">{{ STATUS_LABEL[status] }}</span>
</template>
