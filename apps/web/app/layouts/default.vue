<script setup lang="ts">
const sidebarOpen = ref(false);
</script>

<template>
  <div class="min-h-dvh">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="lg:pl-[240px]">
      <AppTopbar @menu="sidebarOpen = true" />
      <main class="mx-auto max-w-[1360px] px-4 py-7 md:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
