<script setup lang="ts">
// Biểu đồ đường mini (SVG) có vùng tô mờ bên dưới.
const props = withDefaults(defineProps<{ values: number[]; color?: string; height?: number }>(), {
  color: 'var(--primary)',
  height: 64,
});

const WIDTH = 200;
const uid = useId();

const points = computed(() => {
  const vals = props.values.length > 1 ? props.values : [0, ...props.values, 0];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const pad = 6;
  return vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * WIDTH;
    const y = pad + (1 - (v - min) / range) * (props.height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
});
const line = computed(() => `M${points.value.join(' L')}`);
const area = computed(() => `${line.value} L${WIDTH},${props.height} L0,${props.height} Z`);
</script>

<template>
  <svg :viewBox="`0 0 ${WIDTH} ${height}`" preserveAspectRatio="none" class="block w-full" :style="{ height: `${height}px` }" aria-hidden="true">
    <defs>
      <linearGradient :id="`g-${uid}`" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.22" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="area" :fill="`url(#g-${uid})`" />
    <path :d="line" fill="none" :stroke="color" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>
</template>
