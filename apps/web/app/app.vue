<script setup lang="ts">
// Áp dụng giao diện sáng/tối đã lưu ngay khi mở app.
useTheme();
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppMessage />
</template>
