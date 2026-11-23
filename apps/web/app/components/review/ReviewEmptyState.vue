<script setup lang="ts">
// Trạng thái rỗng của Hộp thư duyệt: không còn video nào chờ.
</script>

<template>
  <div class="card grid place-items-center gap-3 p-14 text-center">
    <AppIcon name="circle-check" :size="40" class="text-ok" />
    <p class="text-[1.15rem] font-semibold">Hộp thư đang trống</p>
    <p class="text-muted">Video sau khi worker xử lý xong sẽ tự xuất hiện ở đây để bạn duyệt.</p>
    <NuxtLink to="/videos" class="btn btn-primary mt-2"><AppIcon name="plus" :size="16" /> Tạo video mới</NuxtLink>
  </div>
</template>
