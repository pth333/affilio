<script setup lang="ts">
// Thẻ quyết định: chỉ bật khi video đang chờ duyệt và đúng phiên bản đang xem.
// Nút Duyệt dùng btn-primary (đỏ) để đồng màu với phần còn lại của website.
defineProps<{ canReview: boolean; busy: boolean }>();
const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<template>
  <div class="card p-5">
    <p class="mb-3 font-semibold">Quyết định</p>
    <button class="btn btn-primary w-full" :disabled="!canReview || busy" @click="emit('approve')">
      <AppIcon name="check" :size="16" /> Duyệt video
    </button>
    <button class="btn btn-bad mt-2 w-full" :disabled="!canReview || busy" @click="emit('reject')">
      <AppIcon name="x" :size="16" /> Từ chối
    </button>
    <p v-if="!canReview" class="mt-3 text-[0.85rem] text-muted">
      Chỉ duyệt được khi video đang chờ duyệt và đúng phiên bản đang xem.
    </p>
  </div>
</template>
