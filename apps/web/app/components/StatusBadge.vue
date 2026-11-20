<script setup lang="ts">
import { STATUS_LABEL, type VideoStatus } from '~/types';

const props = defineProps<{ status: VideoStatus }>();

// Viết đủ tên class (không ghép chuỗi) để Tailwind quét được.
const TONE: Partial<Record<VideoStatus, string>> = {
  pending_review: 'border-accent text-accent',
  approved: 'border-ok text-ok',
  ready: 'border-ok text-ok',
  published: 'border-ok text-ok',
  needs_changes: 'border-warn text-warn',
  failed: 'border-bad text-bad',
  rejected: 'border-bad text-bad',
  rejected_auto: 'border-bad text-bad',
};
const tone = computed(() => TONE[props.status] ?? '');
</script>

<template>
  <span class="badge" :class="tone">{{ STATUS_LABEL[status] }}</span>
</template>
