<script setup lang="ts">
// Chi tiết video giờ nằm trong Hộp thư duyệt để chỉ có một nơi xem timeline/sửa cảnh/duyệt.
// Link cũ /videos/:id vẫn dùng được: chuyển thẳng tới hộp thư với video đang chọn.
const route = useRoute();

definePageMeta({ title: 'Chi tiết video' });

onMounted(() => {
  void navigateTo({ path: '/review', query: { video: String(route.params.id) } }, { replace: true });
});
</script>

<template>
  <p class="card p-5 text-muted">Đang chuyển sang hộp thư duyệt…</p>
</template>
