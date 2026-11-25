<script setup lang="ts">
// Popup "AI viết kịch bản" trên trang Kịch bản: bọc AiScriptForm, gửi xong đóng ngay (AI viết ở nền).
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [number] }>();

const busy = ref(false);

function handleSubmitted(count: number): void {
  emit('created', count);
  emit('close');
}
</script>

<template>
  <AppModal
    :open="props.open"
    :busy="busy"
    :width="820"
    eyebrow="Kịch bản mới"
    title="AI viết kịch bản"
    description="AI viết ở nền — bạn đóng popup và làm việc khác. Xong, kịch bản hiện ở danh sách với nhãn “Mới” để bạn xem/sửa rồi tạo video."
    @close="emit('close')"
  >
    <AiScriptForm v-model:busy="busy" @cancel="emit('close')" @submitted="handleSubmitted" />
  </AppModal>
</template>
