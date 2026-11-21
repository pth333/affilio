<script setup lang="ts">
import { AI_QUOTA, BEST_HOOK, CHANNELS, CURRENT_USER, DASHBOARD_STATS, DRAFTS } from '~/data/mock';

definePageMeta({ title: 'Tổng quan' });

const now = new Date();
const period = ref('7');
const activeChannels = CHANNELS.filter((c) => c.status === 'active');
const topDrafts = DRAFTS.slice(0, 3);
const quotaLeft = AI_QUOTA.limit - AI_QUOTA.used;
</script>

<template>
  <PageHeader :eyebrow="formatLongDate(now)" :title="`${getGreetingByHour(now)}, ${CURRENT_USER.name}`">
    <template #title-suffix>
      <AppIcon name="sun" :size="26" class="text-warn" />
    </template>
    <template #actions>
      <NuxtLink to="/review" class="btn btn-primary"><AppIcon name="plus" :size="17" /> Tạo lô video mới</NuxtLink>
    </template>
  </PageHeader>

  <!-- Banner AI -->
  <section class="card mb-6 flex flex-wrap items-center gap-4 border-primary/20 bg-primary-soft/60 p-5">
    <span class="grid size-11 place-items-center rounded-xl bg-primary text-white"><AppIcon name="sparkles" :size="22" /></span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">AI đã làm việc trong lúc bạn nghỉ ngơi.</p>
      <p class="text-muted">{{ DASHBOARD_STATS.pending }} video mới đang chờ bạn duyệt — mất khoảng 5 phút để xem hết.</p>
    </div>
    <NuxtLink to="/review" class="btn">Vào hộp thư duyệt <AppIcon name="arrow-right" :size="16" /></NuxtLink>
  </section>

  <!-- Chỉ số -->
  <section class="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Chờ duyệt" :value="DASHBOARD_STATS.pending" hint="Cần bạn xem" icon="inbox" />
    <StatCard label="Sẵn sàng đăng" :value="DASHBOARD_STATS.ready" hint="Đã duyệt" icon="circle-check" />
    <StatCard label="Video đã đăng tuần này" :value="DASHBOARD_STATS.publishedThisWeek" :trend="DASHBOARD_STATS.weeklyGrowth">
      <BarSparkline :values="DASHBOARD_STATS.weeklyBars" :height="36" />
    </StatCard>
    <StatCard label="Hạn mức AI hôm nay" :value="`${AI_QUOTA.used}/${AI_QUOTA.limit}`" icon="zap">
      <ProgressBar :value="AI_QUOTA.used" :max="AI_QUOTA.limit" label="Hạn mức AI đã dùng" />
      <div class="mt-2 flex justify-between text-[0.85rem] text-muted">
        <span>Còn {{ quotaLeft }} lượt tạo</span>
        <span>Đặt lại lúc 00:00</span>
      </div>
    </StatCard>
  </section>

  <!-- Hiệu quả các kênh -->
  <section class="mb-8">
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-[1.2rem] font-bold">Hiệu quả các kênh</h2>
      <div class="relative">
        <select v-model="period" class="field h-9 appearance-none pr-8" aria-label="Khoảng thời gian">
          <option value="7">7 ngày qua</option>
          <option value="30">30 ngày qua</option>
          <option value="90">90 ngày qua</option>
        </select>
        <AppIcon name="chevron-down" :size="15" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
      </div>
    </div>
    <div class="grid gap-4 lg:grid-cols-3">
      <article v-for="c in activeChannels" :key="c.id" class="card p-5">
        <div class="flex items-center gap-3">
          <ProductThumb :name="c.name" :color="c.color" :size="40" />
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ c.name }}</p>
            <p class="text-[0.85rem] text-muted">{{ c.handle }}</p>
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-[1.6rem] font-bold">{{ formatCompact(c.followers) }}</span>
          <span class="text-muted">lượt xem</span>
          <span class="badge ml-auto bg-ok-soft text-ok">{{ formatPercent(c.growth, true) }}</span>
        </div>
        <LineChart :values="c.trend" :color="c.color" :height="64" class="my-3" />
        <div class="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[0.9rem]">
          <div>
            <p class="text-muted">Lượt nhấp link</p>
            <p class="font-semibold">{{ formatNumber(c.views) }}</p>
          </div>
          <div>
            <p class="text-muted">Video đã đăng</p>
            <p class="font-semibold">{{ c.videos }}</p>
          </div>
        </div>
      </article>
    </div>
  </section>

  <!-- Chờ duyệt + hook nổi bật -->
  <section class="grid gap-4 xl:grid-cols-[1fr_380px]">
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 class="text-[1.1rem] font-bold">Đang chờ bạn duyệt</h2>
        <NuxtLink to="/review" class="text-[0.9rem] font-medium text-primary hover:underline">Xem tất cả</NuxtLink>
      </div>
      <ul>
        <li v-for="d in topDrafts" :key="d.id" class="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-hover">
          <ProductThumb :name="d.productName" :color="d.color" :size="42" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ d.productName }}</p>
            <p class="truncate text-[0.85rem] text-muted">{{ d.channelName }} · {{ d.duration }} giây · tạo lúc {{ d.createdAt }}</p>
          </div>
          <ScoreBadge :score="d.score" />
          <NuxtLink :to="{ path: '/review', query: { id: d.id } }" class="btn btn-sm">Duyệt <AppIcon name="chevron-right" :size="15" /></NuxtLink>
        </li>
      </ul>
    </div>

    <!-- Thẻ tối: hook nổi bật -->
    <div class="relative overflow-hidden rounded-(--radius-card) border border-[#40374f] bg-[#2b2838] p-6 text-white">
      <div class="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-[radial-gradient(circle,#3d354e,transparent_70%)]" />
      <p class="eyebrow relative text-[#b9add0]">Hook nổi bật tuần này</p>
      <p class="relative mt-3 text-[1.3rem] leading-snug font-semibold">“{{ BEST_HOOK.text }}”</p>
      <p class="relative mt-2 text-[0.9rem] text-[#b9add0]">{{ BEST_HOOK.channel }}</p>
      <dl class="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        <div>
          <dt class="text-[0.8rem] text-[#b9add0]">Lượt xem</dt>
          <dd class="text-[1.15rem] font-bold">{{ formatCompact(BEST_HOOK.views) }}</dd>
        </div>
        <div>
          <dt class="text-[0.8rem] text-[#b9add0]">Xem hết</dt>
          <dd class="text-[1.15rem] font-bold">{{ formatPercent(BEST_HOOK.completion) }}</dd>
        </div>
        <div>
          <dt class="text-[0.8rem] text-[#b9add0]">So với TB kênh</dt>
          <dd class="text-[1.15rem] font-bold">{{ String(BEST_HOOK.multiplier).replace('.', ',') }}x</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
