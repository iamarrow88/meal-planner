<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, today } from '@/lib/dates';
import type { BatchState } from '@/lib/leftovers';
import { portionSources } from '@/lib/portions';
import { useLeftoversStore } from '@/stores/leftovers';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

/** Главная: что приготовлено и ещё лежит. Старше трёх дней — пора доесть. */
const OLD_AFTER_DAYS = 3;

const leftovers = useLeftoversStore();
const recipes = useRecipesStore();
const sets = useSetsStore();

const fmt = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');

function daysAgo(date: string) {
  let n = 0;
  while (addDays(date, n) < today()) n++;
  return n;
}
const agoText = (n: number) => (n === 0 ? 'сегодня' : n === 1 ? 'вчера' : `${n} дн. назад`);

const items = computed(() =>
  leftovers.available.map((s) => {
    const recipe = recipes.byId.get(s.batch.recipeId);
    const ago = daysAgo(s.batch.cookedAt);
    // свободное — в порциях каждого сета, где есть рецепт
    const portions = recipe
      ? portionSources(recipe, sets.sets)
          .filter((p, i, all) => all.findIndex((q) => q.setName === p.setName) === i)
          .map((p) => `${fmt(s.free / p.grams)} — ${p.setName}`)
      : [];
    return { s, recipe, ago, old: ago > OLD_AFTER_DAYS, portions };
  }),
);

// одна открытая форма: списать или взвесить
const editing = ref<{ id: string; mode: 'discard' | 'weigh'; grams: number } | null>(null);
const open = (s: BatchState, mode: 'discard' | 'weigh') => (editing.value = { id: s.batch.id, mode, grams: Math.round(s.left) });

async function apply() {
  const e = editing.value;
  if (!e) return;
  if (e.mode === 'discard') await leftovers.discard(e.id, e.grams);
  else await leftovers.weigh(e.id, e.grams);
  editing.value = null;
}
</script>

<template>
  <div v-if="items.length" class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold">🍲 Уже приготовлено</h2>
    <div v-for="it in items" :key="it.s.batch.id" class="card flex flex-col gap-1 py-3" :class="{ 'border-warn': it.old }">
      <RouterLink v-if="it.recipe" :to="{ name: 'recipe', params: { id: it.recipe.id } }" class="font-semibold text-accent">
        {{ it.recipe.title }}
      </RouterLink>
      <span v-else class="font-semibold">Рецепт удалён</span>
      <span>
        Осталось {{ Math.round(it.s.left) }} г<template v-if="it.s.reserved">, из них {{ Math.round(it.s.reserved) }} г уже в меню</template>
      </span>
      <span v-if="it.s.free > 0 && it.portions.length" class="hint">Свободно порций: {{ it.portions.join(' · ') }}</span>
      <span class="hint" :class="{ 'text-warn': it.old }">
        Приготовлено {{ agoText(it.ago) }}<template v-if="it.old"> — пора доесть</template>
      </span>
      <div v-if="editing?.id === it.s.batch.id" class="mt-1 flex flex-wrap items-center gap-2">
        <span>{{ editing.mode === 'discard' ? 'Списать' : 'Сейчас осталось' }}</span>
        <input v-model.number="editing.grams" type="number" min="0" inputmode="numeric" class="w-[90px]" aria-label="Граммы" />
        г
        <button class="btn-primary py-1" @click="apply">Готово</button>
        <button class="btn-secondary py-1" @click="editing = null">Отмена</button>
      </div>
      <div v-else class="mt-1 flex gap-4">
        <button class="link text-[13px]" @click="open(it.s, 'discard')">Списать (выбросили)</button>
        <button class="link text-[13px]" @click="open(it.s, 'weigh')">Взвесила — поправить</button>
      </div>
    </div>
  </div>
</template>
