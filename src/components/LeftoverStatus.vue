<script setup lang="ts">
import { computed, ref } from 'vue';
import { today } from '@/lib/dates';
import type { Need } from '@/lib/leftovers';
import { useLeftoversStore } from '@/stores/leftovers';

/** Под вариантом сета в меню: берётся ли блюдо из приготовленного, «Съедено», «готовлю заново». */
const props = defineProps<{ need: Need }>();
const emit = defineEmits<{ fresh: [on: boolean] }>();

const leftovers = useLeftoversStore();
const c = computed(() => leftovers.coverageOf(props.need));
const hasBatches = computed(() => leftovers.batches.some((b) => b.recipeId === props.need.recipeId));
const past = computed(() => props.need.date < today());

const g = (n: number) => `${Math.round(n)} г`;

const editing = ref(false);
const grams = ref(0);
function startEat() {
  grams.value = Math.round(c.value?.covered ?? 0);
  editing.value = true;
}
async function eat() {
  if (grams.value > 0) await leftovers.eat(props.need, grams.value);
  editing.value = false;
}
</script>

<template>
  <div v-if="c" class="flex flex-col gap-1 text-[13px]">
    <p v-if="c.closed" class="flex flex-wrap items-center gap-x-3">
      <span class="text-accent">✓ Съедено {{ g(c.eaten) }} из приготовленного</span>
      <button class="link text-[13px]" @click="leftovers.uneat(need)">Снять отметку</button>
    </p>
    <template v-else-if="c.covered > 0">
      <p>
        🍲 Из приготовленного{{ c.missing > 0 ? `: ${g(c.covered)}, не хватает ${g(c.missing)}` : '' }}
        <span v-if="past" class="text-warn"> · Отметить съеденным?</span>
      </p>
      <div v-if="editing" class="flex flex-wrap items-center gap-2">
        <span>Съедено</span>
        <input v-model.number="grams" type="number" min="0" inputmode="numeric" class="w-[80px]" aria-label="Съедено, г" />
        г
        <button class="btn-primary py-1" @click="eat">Готово</button>
        <button class="btn-secondary py-1" @click="editing = false">Отмена</button>
      </div>
      <p v-else class="flex flex-wrap gap-x-4">
        <button class="link text-[13px]" @click="startEat">Съедено</button>
        <button class="link text-[13px] text-muted" @click="emit('fresh', true)">Готовлю заново</button>
      </p>
    </template>
    <p v-else-if="need.freshSince" class="flex flex-wrap gap-x-3">
      <span class="hint">Готовлю заново</span>
      <button v-if="hasBatches" class="link text-[13px]" @click="emit('fresh', false)">Брать из приготовленного</button>
    </p>
  </div>
</template>
