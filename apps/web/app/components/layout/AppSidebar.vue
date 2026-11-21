<script setup lang="ts">
import { AI_QUOTA, CURRENT_USER, MAIN_NAV } from '~/data/mock';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const { isDark, toggleTheme } = useTheme();

function isNavItemActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}

// Đổi trang trên mobile thì đóng sidebar.
watch(
  () => route.path,
  () => emit('close'),
);
</script>

<template>
  <!-- Lớp phủ khi mở trên mobile -->
  <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="transition">
    <div v-if="open" class="fixed inset-0 z-30 bg-black/30 lg:hidden" @click="emit('close')" />
  </Transition>

  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line bg-surface px-4 pt-7 pb-4 transition-transform lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="px-2">
      <BrandLogo />
    </div>

    <!-- Không gian làm việc -->
    <button
      type="button"
      class="mt-6 flex items-center gap-2.5 rounded-lg border border-line p-2 text-left hover:bg-hover"
      @click="message.info('Bạn đang có một không gian làm việc.')"
    >
      <span class="grid size-8 place-items-center rounded-md bg-primary-soft text-[0.85rem] font-bold text-primary-strong">
        {{ getInitials(CURRENT_USER.workspace) }}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-semibold">{{ CURRENT_USER.workspace }}</span>
        <span class="block text-[0.8rem] text-muted">Không gian làm việc</span>
      </span>
      <AppIcon name="chevrons-up-down" :size="15" class="text-muted" />
    </button>

    <nav class="mt-6 -mx-1 flex-1 overflow-y-auto px-1" aria-label="Điều hướng chính">
      <p class="eyebrow mb-2 px-2.5 text-[0.72rem]">Không gian sáng tạo</p>
      <ul class="space-y-0.5">
        <li v-for="item in MAIN_NAV" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium transition-colors"
            :class="isNavItemActive(item.to) ? 'bg-primary-soft text-primary-strong' : 'text-fg/80 hover:bg-hover hover:text-fg'"
          >
            <AppIcon :name="item.icon" :size="18" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.count" class="rounded-full bg-primary-chip px-2 text-[0.75rem] font-semibold text-primary-chip-fg">
              {{ item.count }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <NuxtLink
        to="/review"
        class="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 px-3 py-2.5 font-medium text-primary-strong hover:bg-primary-soft"
      >
        <AppIcon name="plus" :size="17" />
        Tạo lô video mới
      </NuxtLink>

      <!-- Thẻ gói -->
      <div
        class="mt-5 rounded-[10px] border border-[#ebe6fa] bg-linear-to-b from-[#f6f3ff] to-[#f0effb] p-4 dark:border-line dark:from-primary-soft dark:to-surface"
      >
        <p class="font-semibold">Ý tưởng lớn. Bắt đầu nhỏ.</p>
        <p class="mt-1 text-[0.85rem] text-muted">Đã dùng {{ AI_QUOTA.used }}/{{ AI_QUOTA.limit }} lượt AI hôm nay.</p>
        <button
          type="button"
          class="mt-3 flex items-center gap-1 text-[0.9rem] font-semibold text-primary-strong hover:underline"
          @click="message.info('Gói Pro sẽ sớm ra mắt.')"
        >
          Khám phá gói Pro <AppIcon name="arrow-right" :size="15" />
        </button>
      </div>
    </nav>

    <div class="mt-4 space-y-0.5 border-t border-line pt-3">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-fg/80 hover:bg-hover"
        @click="message.info('Trang cài đặt đang được xây dựng.')"
      >
        <AppIcon name="settings-2" :size="18" /> Cài đặt
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-fg/80 hover:bg-hover"
        @click="message.info('Kênh hỗ trợ sẽ sớm được kết nối.')"
      >
        <AppIcon name="circle-question-mark" :size="18" /> Trợ giúp &amp; phản hồi
      </button>

      <div class="mt-2 flex items-center gap-2.5 px-1.5 pt-2">
        <span class="grid size-9 place-items-center rounded-full bg-primary text-[0.85rem] font-semibold text-white">
          {{ getInitials(CURRENT_USER.name) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ CURRENT_USER.name }}</span>
          <span class="block text-[0.8rem] text-muted">{{ CURRENT_USER.role }}</span>
        </span>
        <button type="button" class="icon-btn" :aria-label="isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'" @click="toggleTheme">
          <AppIcon :name="isDark ? 'sun' : 'moon'" :size="18" />
        </button>
      </div>
    </div>
  </aside>
</template>
