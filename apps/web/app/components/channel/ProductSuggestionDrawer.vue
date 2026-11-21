<script setup lang="ts">
// Drawer trượt từ phải: danh sách sản phẩm hợp định hướng của một kênh. Esc / bấm nền để đóng.
import type { Channel, ProductSuggestion } from '~/types';

const props = defineProps<{ channel: Channel | null; suggestions: ProductSuggestion[] }>();
const emit = defineEmits<{ close: [] }>();

const maxPrice = computed(() => (props.channel ? parseMaxPrice(props.channel.series) : null));

async function copySuggestedLink(suggestion: ProductSuggestion): Promise<void> {
  if (await copyToClipboard(suggestion.product.affiliateUrl)) message.success('Đã sao chép link affiliate');
  else message.error('Trình duyệt chưa cho phép sao chép. Hãy sao chép thủ công.');
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.channel) emit('close');
}

onMounted(() => window.addEventListener('keydown', handleEscapeKey));
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscapeKey));
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-200">
      <div v-if="channel" class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" @click="emit('close')" />
    </Transition>
    <Transition
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-200 ease-in"
    >
      <aside
        v-if="channel"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="`Gợi ý sản phẩm cho ${channel.name}`"
      >
        <!-- Đầu drawer -->
        <header class="border-b border-line px-6 pt-6 pb-5">
          <div class="flex items-start gap-3">
            <ProductThumb :name="channel.name" :color="channel.color" :size="44" />
            <div class="min-w-0 flex-1">
              <p class="eyebrow flex items-center gap-1.5 text-primary"><AppIcon name="sparkles" :size="13" /> Gợi ý sản phẩm</p>
              <h2 class="truncate text-[1.2rem] font-bold tracking-[-0.01em]">{{ channel.name }}</h2>
            </div>
            <button class="icon-btn -mt-1 -mr-2" aria-label="Đóng" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
          </div>

          <p class="mt-4 mb-2 text-[0.85rem] text-muted">Lọc theo định hướng kênh</p>
          <div class="flex flex-wrap gap-1.5">
            <span class="badge bg-primary-chip text-primary-chip-fg"><AppIcon name="layers" :size="12" /> {{ channel.tag }}</span>
            <span v-if="maxPrice !== null" class="badge bg-primary-chip text-primary-chip-fg">
              <AppIcon name="trending-up" :size="12" /> ≤ {{ formatCurrency(maxPrice) }}
            </span>
            <span class="badge bg-primary-chip text-primary-chip-fg"><AppIcon name="film" :size="12" /> Ưu tiên có clip</span>
          </div>
        </header>

        <!-- Danh sách -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <template v-if="suggestions.length">
            <p class="mb-3 text-[0.9rem] text-muted">
              <strong class="text-fg">{{ suggestions.length }}</strong> sản phẩm phù hợp · xếp theo điểm
            </p>
            <ul class="space-y-3">
              <li
                v-for="(s, index) in suggestions"
                :key="s.product.id"
                class="rounded-xl border border-line p-4 transition-colors hover:border-primary/40"
                :class="index === 0 ? 'bg-primary-soft/40' : 'bg-surface'"
              >
                <div class="flex items-start gap-3">
                  <ProductThumb :name="s.product.name" :color="s.product.color" :size="44" />
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold leading-snug">{{ s.product.name }}</p>
                    <p class="mt-0.5 text-[0.85rem] text-muted">
                      {{ s.product.brand }} · <span class="font-medium text-fg">{{ formatCurrency(s.product.price) }}</span>
                    </p>
                  </div>
                  <ScoreBadge :score="s.score" />
                </div>

                <ProgressBar class="mt-3" :value="s.score" :label="`Độ phù hợp ${s.score}%`" />

                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="r in s.reasons"
                    :key="r.label"
                    class="badge text-[0.75rem]"
                    :class="r.matched ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'"
                  >
                    <AppIcon :name="r.matched ? 'check' : 'triangle-alert'" :size="12" /> {{ r.label }}
                  </span>
                </div>

                <div class="mt-4 flex gap-2">
                  <button class="btn btn-sm flex-1" @click="copySuggestedLink(s)"><AppIcon name="link" :size="15" /> Sao chép link</button>
                  <button class="btn btn-sm btn-primary flex-1" @click="message.info('Tạo video từ gợi ý sẽ sớm khả dụng.')">
                    <AppIcon name="sparkles" :size="15" /> Tạo video
                  </button>
                </div>
              </li>
            </ul>
          </template>

          <div v-else class="flex h-full flex-col items-center justify-center px-4 text-center">
            <span class="mb-4 grid size-14 place-items-center rounded-2xl bg-hover text-muted"><AppIcon name="package" :size="26" /></span>
            <p class="font-semibold">Chưa có sản phẩm phù hợp</p>
            <p class="mt-1 text-[0.9rem] text-muted">Thư viện chưa có sản phẩm thuộc ngành “{{ channel.tag }}”.</p>
            <NuxtLink to="/products" class="btn btn-sm mt-5" @click="emit('close')"><AppIcon name="plus" :size="15" /> Thêm sản phẩm</NuxtLink>
          </div>
        </div>

        <footer class="border-t border-line px-6 py-3 text-[0.8rem] text-muted">
          Điểm dựa trên ngành hàng, mức giá của series và clip có sẵn.
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
