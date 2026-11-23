<script setup lang="ts">
// Cột phải Hộp thư duyệt: kết quả kiểm tra tự động, ghi chú và lịch sử duyệt của phiên bản đang xem.
import type { VideoDetail } from '~/types';

defineProps<{
  check: VideoDetail['check'];
  notes: VideoDetail['notes'];
  reviews: VideoDetail['reviews'];
}>();
</script>

<template>
  <div class="card p-5">
    <div class="mb-3 flex items-center justify-between">
      <p class="font-semibold">Kiểm tra tự động</p>
      <span v-if="check" class="badge" :class="check.passed ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'">
        {{ check.passed ? 'Đạt' : 'Cần xem' }}
      </span>
      <span v-else class="text-muted">Chưa có</span>
    </div>
    <ul v-if="check?.rules.length" class="space-y-2">
      <li v-for="rule in check.rules" :key="rule.rule" class="flex items-start gap-2">
        <AppIcon
          :name="rule.passed ? 'circle-check' : 'triangle-alert'"
          :size="17"
          class="mt-0.5"
          :class="rule.passed ? 'text-ok' : 'text-warn'"
        />
        <span :class="rule.passed ? '' : 'text-warn'">
          {{ CHECK_RULE_LABEL[rule.rule] ?? rule.rule }}<span v-if="rule.message"> — {{ rule.message }}</span>
        </span>
      </li>
    </ul>
    <p v-else class="text-[0.9rem] text-muted">Chưa chạy kiểm tra cho phiên bản này.</p>
  </div>

  <div v-if="notes.length" class="card p-5">
    <p class="mb-2 font-semibold">Ghi chú</p>
    <ul class="space-y-2 text-[0.9rem]">
      <li v-for="note in notes" :key="note.id" class="rounded-lg bg-hover px-3 py-2">
        <p>{{ note.text }}</p>
        <p class="text-[0.78rem] text-muted">{{ formatDateTime(note.createdAt) }}</p>
      </li>
    </ul>
  </div>

  <div v-if="reviews.length" class="card p-5">
    <p class="mb-2 font-semibold">Lịch sử duyệt</p>
    <ul class="space-y-1.5 text-[0.88rem]">
      <li v-for="item in reviews" :key="item.id" class="flex items-center justify-between gap-2">
        <span class="badge bg-hover text-muted">{{ REVIEW_DECISION_LABEL[item.decision] ?? item.decision }}</span>
        <span class="text-muted">{{ formatDateTime(item.createdAt) }}</span>
      </li>
    </ul>
  </div>
</template>
