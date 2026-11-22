<script setup lang="ts">
// Hộp thoại dùng chung: nền mờ, đóng bằng Esc / nút X / bấm ra ngoài, khoá cuộn trang khi mở.
// Nội dung chia 3 vùng: đầu (tiêu đề), thân (cuộn được) và chân (nút hành động) qua slot.
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    eyebrow?: string;
    description?: string;
    /** Bề rộng tối đa của hộp thoại (px). */
    width?: number;
    /** Đang xử lý: chặn đóng để không mất dữ liệu đang gửi. */
    busy?: boolean;
    closeLabel?: string;
  }>(),
  { width: 640, busy: false, closeLabel: 'Đóng' },
);
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
let savedOverflow: string | null = null;

function requestClose(): void {
  if (!props.busy) emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) requestClose();
}

function lockScroll(locked: boolean): void {
  if (!import.meta.client) return;
  if (locked && savedOverflow === null) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (!locked && savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
}

watch(
  () => props.open,
  async (open) => {
    lockScroll(open);
    if (open) {
      await nextTick();
      panel.value?.focus();
    }
  },
);

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  lockScroll(false);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
        <div class="fixed inset-0 bg-[#2a1712]/50 backdrop-blur-[2px]" @click="requestClose" />

        <div
          ref="panel"
          class="modal-pop relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-20px_#2c211c66] outline-none"
          :style="{ maxWidth: `${width}px` }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <header class="flex items-start gap-3 border-b border-line px-5 py-4">
            <div class="min-w-0 flex-1">
              <p v-if="eyebrow" class="eyebrow mb-1">{{ eyebrow }}</p>
              <h2 class="text-[1.2rem] leading-tight font-bold tracking-[-0.01em]">{{ title }}</h2>
              <p v-if="description" class="mt-1 text-[0.9rem] text-muted">{{ description }}</p>
            </div>
            <button type="button" class="icon-btn -mt-1 -mr-1.5" :aria-label="closeLabel" @click="requestClose">
              <AppIcon name="x" :size="18" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="border-t border-line bg-surface-2 px-5 py-4">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
