<script setup lang="ts">
import { type Rated, useRatingsStore } from '@/stores/ratings';

/** Оценка 1–5 звёзд; readonly — только показать (в списках). */
const props = defineProps<{ kind: Rated; id: string; readonly?: boolean }>();
const ratings = useRatingsStore();
const stars = () => ratings.get(props.kind, props.id) ?? 0;
</script>

<template>
  <span v-if="readonly" class="text-[13px] text-accent" :aria-label="`Оценка: ${stars()} из 5`">
    <template v-if="stars()">{{ '★'.repeat(stars()) }}<span class="text-muted">{{ '☆'.repeat(5 - stars()) }}</span></template>
  </span>
  <div v-else class="flex items-center gap-2">
    <div class="flex" role="radiogroup" aria-label="Оценка">
      <button
        v-for="n in 5"
        :key="n"
        role="radio"
        :aria-checked="stars() === n"
        :aria-label="`${n} из 5`"
        class="cursor-pointer px-0.5 text-2xl leading-none text-accent"
        @click="ratings.rate(kind, id, n)"
      >
        {{ n <= stars() ? '★' : '☆' }}
      </button>
    </div>
    <span class="hint">{{ stars() ? 'Нажмите ту же звезду, чтобы снять оценку' : 'Оцените' }}</span>
  </div>
</template>
