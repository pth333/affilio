<script setup lang="ts">
// Vùng hiển thị toast — đặt một lần trong app.vue. Gọi bằng message.success/error/warning/info.
const { items, closeMessage } = useMessageList();

const STYLE: Record<MessageType, { icon: IconName; color: string }> = {
  success: { icon: 'circle-check', color: 'text-[#b6d5b7]' },
  error: { icon: 'circle-x', color: 'text-[#f2a7a4]' },
  warning: { icon: 'triangle-alert', color: 'text-[#f3cf8d]' },
  info: { icon: 'info', color: 'text-[#b5c9f0]' },
};
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-7 left-1/2 z-50 flex w-[min(92vw,460px)] -translate-x-1/2 flex-col items-center gap-2 lg:left-[calc(50%+112px)]"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="opacity-0 translate-y-2.5"
      leave-to-class="opacity-0 translate-y-2.5"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-200 absolute"
      move-class="transition duration-200"
    >
      <div
        v-for="m in items"
        :key="m.id"
        class="pointer-events-auto flex max-w-full items-start gap-2.5 rounded-[10px] border border-[#65567a] bg-[#30283f] py-3.5 pr-3 pl-4 text-white shadow-[0_5px_25px_#25213240]"
      >
        <AppIcon :name="STYLE[m.type].icon" :size="19" :class="STYLE[m.type].color" class="mt-px" />
        <span class="min-w-0 flex-1 leading-snug">{{ m.text }}</span>
        <button type="button" class="-my-0.5 rounded p-0.5 text-[#aaa0b7] hover:text-white" aria-label="Đóng thông báo" @click="closeMessage(m.id)">
          <AppIcon name="x" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
