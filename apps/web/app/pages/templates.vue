<script setup lang="ts">
import { TEMPLATES } from '~/data/mock';
import type { ContentTemplate } from '~/types';

definePageMeta({ title: 'Định dạng & mẫu' });

type TemplateTab = 'all' | 'system' | 'mine';
const TABS: { key: TemplateTab; label: string }[] = [
  { key: 'all', label: 'Tất cả mẫu' },
  { key: 'system', label: 'Mẫu hệ thống' },
  { key: 'mine', label: 'Mẫu của tôi' },
];

const tab = ref<TemplateTab>('all');
const visible = computed(() =>
  TEMPLATES.filter((t) => tab.value === 'all' || (tab.value === 'system' ? t.system : !t.system)),
);

function selectTemplate(t: ContentTemplate): void {
  message.success(`Đã chọn định dạng “${t.name}” cho lô video tiếp theo.`);
}
</script>

<template>
  <PageHeader title="Định dạng & mẫu" description="Khung kịch bản đã được kiểm chứng. Chọn một định dạng, AI sẽ viết theo cấu trúc đó.">
    <template #actions>
      <button class="btn" @click="message.info('Trình tạo mẫu riêng đang được xây dựng.')"><AppIcon name="plus" :size="16" /> Tạo mẫu</button>
    </template>
  </PageHeader>

  <div class="tabs mb-5" role="tablist">
    <button
      v-for="t in TABS"
      :key="t.key"
      role="tab"
      class="tab"
      :class="{ 'tab-active': tab === t.key }"
      :aria-selected="tab === t.key"
      @click="tab = t.key"
    >
      {{ t.label }}
    </button>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <article v-for="t in visible" :key="t.id" class="card flex flex-col overflow-hidden">
      <div class="grid h-32 place-items-center dark:opacity-80" :style="{ background: t.cover }">
        <span class="text-[2.6rem] font-extrabold tracking-[-0.04em] text-[#292a36]/70">{{ t.glyph }}</span>
      </div>
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold">{{ t.name }}</h3>
          <span v-if="!t.system" class="badge bg-primary-soft text-primary-strong">Của tôi</span>
        </div>
        <p class="mt-1 text-[0.9rem] text-muted">{{ t.description }}</p>
        <p class="mt-3 text-[0.85rem]">
          <span v-for="(s, i) in t.structure" :key="s">
            <span class="font-medium">{{ s }}</span><span v-if="i < t.structure.length - 1" class="mx-1 text-muted">→</span>
          </span>
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[0.88rem]">
          <div>
            <p class="text-muted">Xem hết</p>
            <p class="font-semibold">{{ formatPercent(t.completionRate) }}</p>
          </div>
          <div>
            <p class="text-muted">Nhấp / 1.000 view</p>
            <p class="font-semibold">{{ t.clickRate }}</p>
          </div>
        </div>
        <button class="btn btn-sm mt-4 w-full" @click="selectTemplate(t)">Dùng định dạng này</button>
      </div>
    </article>
  </div>
</template>
