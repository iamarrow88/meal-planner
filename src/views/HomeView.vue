<script setup lang="ts">
import { computed, ref } from 'vue';
import SavedMenus from '@/components/SavedMenus.vue';
import { addDays, formatDay, today } from '@/lib/dates';
import { db } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import { dailyTips } from '@/lib/tips';
import { MEALS, MEAL_LABELS, type DayPlan } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

const recipes = useRecipesStore();
const sets = useSetsStore();
const favorites = useFavoritesStore();

// для совета нужна вся история меню, а не только открытый период
const days = useLiveQuery<DayPlan[]>(() => db.days.filter((d) => !d.deleted).toArray(), []);

const day = today();
const tips = computed(() => dailyTips(days.value, sets.byId, recipes.recipes, day));
// «Другой совет» листает дальше, после последнего — снова первый
const index = ref(0);
const tip = computed(() => (tips.value.length ? tips.value[index.value % tips.value.length] : undefined));

function daysAgo(date: string) {
  let n = 0;
  while (addDays(date, n) < day) n++;
  return n;
}

const shortDay = (iso: string) => formatDay(iso).replace(/^[^,]*,\s*/, '');

const liked = computed(() =>
  MEALS.map((meal) => ({ meal, sets: sets.sets.filter((s) => s.meal === meal && favorites.has(s.id)) })).filter(
    (g) => g.sets.length,
  ),
);
</script>

<template>
  <section class="flex flex-col gap-5">
    <p v-if="!recipes.recipes.length && !sets.sets.length" class="py-6 text-center text-muted">
      Сначала загрузите папку из Obsidian на вкладке
      <RouterLink to="/data" class="text-accent">«Данные»</RouterLink>.
    </p>

    <div v-if="tip" class="card flex flex-col gap-2 border-accent">
      <span class="hint">💡 Предложение дня</span>
      <p class="text-[17px]">
        <template v-if="tip.kind === 'forgotten'">
          Вы давно не ели
          <RouterLink :to="{ name: 'recipe', params: { id: tip.recipe.id } }" class="font-semibold text-accent">
            {{ tip.recipe.title }}
          </RouterLink>
          — последний раз {{ shortDay(tip.last) }}, {{ daysAgo(tip.last) }} дн. назад.
        </template>
        <template v-else>
          А вы пробовали
          <RouterLink :to="{ name: 'recipe', params: { id: tip.recipe.id } }" class="font-semibold text-accent">
            {{ tip.recipe.title }}
          </RouterLink>?
        </template>
      </p>
      <p v-if="tip.recipe.time" class="hint">⏱ {{ tip.recipe.time }}</p>
      <p v-if="tip.sets.length" class="hint">
        Есть в сетах:
        <template v-for="(s, i) in tip.sets" :key="s.id">
          <RouterLink :to="{ name: 'set', params: { id: s.id } }" class="text-accent">{{ s.name }}</RouterLink>
          <span v-if="i < tip.sets.length - 1">, </span>
        </template>
      </p>
      <button v-if="tips.length > 1" class="link self-start text-[14px]" @click="index++">Другое предложение ›</button>
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">★ Избранное</h2>
      <p v-if="!liked.length" class="hint">
        Отметьте понравившиеся сеты звёздочкой на вкладке <RouterLink to="/sets" class="text-accent">«Сеты»</RouterLink>.
      </p>
      <div v-for="g in liked" :key="g.meal" class="flex flex-col gap-1.5">
        <span class="hint">{{ MEAL_LABELS[g.meal] }}</span>
        <RouterLink
          v-for="s in g.sets"
          :key="s.id"
          :to="{ name: 'set', params: { id: s.id } }"
          class="card flex flex-col gap-0.5 py-3"
        >
          <span class="font-semibold">{{ s.name }}</span>
          <span class="hint">{{ s.groups.map((gr) => gr.title).join(' · ') }}</span>
        </RouterLink>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">📋 Сохранённые меню</h2>
      <SavedMenus list-only />
    </div>
  </section>
</template>
