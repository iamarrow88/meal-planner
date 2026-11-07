<script setup lang="ts">
import { formatDay, today } from '@/lib/dates';
import { usePlanStore } from '@/stores/plan';

const plan = usePlanStore();

function onDate(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (value) plan.start = value;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex self-start overflow-hidden rounded-[10px] border border-line">
      <button
        v-for="opt in [{ n: 1, label: 'День' }, { n: 7, label: 'Неделя' }] as const"
        :key="opt.n"
        class="cursor-pointer px-[18px] py-2"
        :class="plan.length === opt.n ? 'bg-accent text-white' : 'bg-surface'"
        @click="plan.length = opt.n"
      >
        {{ opt.label }}
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <button class="size-9 cursor-pointer rounded-lg border border-line bg-surface text-xl leading-none" aria-label="Назад" @click="plan.shift(-1)">‹</button>
      <input type="date" :value="plan.start" @change="onDate" />
      <button class="size-9 cursor-pointer rounded-lg border border-line bg-surface text-xl leading-none" aria-label="Вперёд" @click="plan.shift(1)">›</button>
      <button class="link" @click="plan.start = today()">Сегодня</button>
    </div>
    <div v-if="plan.length === 7" class="hint">{{ formatDay(plan.start) }} — {{ formatDay(plan.end) }}</div>
  </div>
</template>
