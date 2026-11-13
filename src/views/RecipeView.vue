<script setup lang="ts">
import { marked } from 'marked';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StarRating from '@/components/StarRating.vue';
import { portionSources, scaleIngredientsSection } from '@/lib/portions';
import { MEAL_LABELS } from '@/lib/types';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

const props = defineProps<{ id: string }>();
const store = useRecipesStore();
const sets = useSetsStore();
const route = useRoute();
const router = useRouter();

// откуда пришли внутри приложения; если рецепт открыт по прямой ссылке, предыдущей страницы нет
const previous = computed(() => {
  void route.fullPath; // пересчитывать при каждом переходе
  const back = window.history.state?.back;
  return typeof back === 'string' ? router.resolve(back) : null;
});

const backLabel = computed(() => {
  const to = previous.value;
  if (!to) return '';
  if (to.name === 'set') return sets.byId.get(String(to.params.id))?.name ?? 'Сет';
  const labels: Record<string, string> = { shopping: 'Список покупок', menu: 'Меню', recipes: 'Все рецепты', home: 'Главная', sets: 'Все сеты' };
  return labels[String(to.name)] ?? 'Назад';
});

const recipe = computed(() => store.byId.get(props.id));

// пересчёт на порции: размер порции — как в одном из сетов или свой, в граммах
const sources = computed(() => (recipe.value ? portionSources(recipe.value, sets.sets) : []));
const grams = ref<number | null>(null);
const count = ref(1);
const fmt = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');
const portionsInRecipe = computed(() => {
  const y = recipe.value?.yieldGrams;
  return y && grams.value ? y / grams.value : null;
});
const fitCount = () => {
  count.value = portionsInRecipe.value ? Math.max(1, Math.round(portionsInRecipe.value)) : 1;
};
function pickGrams(g: number | null) {
  grams.value = g;
  fitCount();
}
// сначала — весь рецепт в порциях первого сета, чтобы количества совпадали с заметкой
watch(
  () => [props.id, recipe.value?.yieldGrams, sources.value[0]?.grams],
  () => pickGrams(recipe.value?.yieldGrams ? (sources.value[0]?.grams ?? recipe.value.yieldGrams) : null),
  { immediate: true },
);
const factor = computed(() => {
  const y = recipe.value?.yieldGrams;
  if (!y) return count.value; // веса нет — умножаем весь рецепт
  return grams.value && grams.value > 0 ? (count.value * grams.value) / y : 1;
});

const html = computed(() =>
  recipe.value ? (marked.parse(scaleIngredientsSection(recipe.value.body, factor.value)) as string) : '',
);
</script>

<template>
  <section class="flex flex-col gap-3">
    <!-- «назад» по истории: страница откроется там же, где её пролистали, и с тем же выбором -->
    <button v-if="previous" class="link self-start text-left" @click="router.back()">‹ {{ backLabel }}</button>
    <RouterLink v-else to="/recipes" class="link">‹ Все рецепты</RouterLink>
    <p v-if="!recipe" class="py-6 text-center text-muted">Рецепт не найден.</p>
    <article v-else class="card">
      <div class="hint">
        {{ recipe.meals.map((m) => MEAL_LABELS[m]).join(', ') }}
        <template v-if="recipe.time"> · {{ recipe.time }}</template>
      </div>
      <h2 class="mt-1.5 text-[22px] font-bold">{{ recipe.title }}</h2>
      <StarRating kind="recipe" :id="recipe.id" class="mt-1.5" />
      <div v-if="recipe.ingredients.length" class="mt-3 flex flex-col gap-2 rounded-lg border border-line p-2.5">
        <div v-if="recipe.yieldGrams" class="flex flex-wrap items-center gap-1.5">
          <span class="w-[72px] shrink-0 font-medium">Порция</span>
          <button
            v-for="s in sources"
            :key="s.setId + s.grams"
            class="chip py-1"
            :class="{ 'chip-on': grams === s.grams }"
            @click="pickGrams(s.grams)"
          >
            {{ s.setName }} — {{ fmt(s.grams) }} г
          </button>
          <label class="flex items-center gap-1">
            <input
              :value="grams ?? ''"
              type="number"
              min="1"
              inputmode="numeric"
              class="w-[76px]"
              aria-label="Порция, г"
              @change="pickGrams(Number(($event.target as HTMLInputElement).value) || null)"
            />
            г
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="w-[72px] shrink-0 font-medium">{{ recipe.yieldGrams ? 'Порций' : 'Рецептов' }}</span>
          <button class="btn-secondary px-3 py-1" aria-label="Меньше" :disabled="count <= 1" @click="count--">−</button>
          <span class="min-w-[2ch] text-center text-[17px] font-semibold" aria-live="polite">{{ count }}</span>
          <button class="btn-secondary px-3 py-1" aria-label="Больше" @click="count++">+</button>
          <span v-if="portionsInRecipe" class="hint">весь рецепт — {{ fmt(portionsInRecipe) }} порц.</span>
        </div>
        <p v-if="!recipe.yieldGrams" class="text-[13px] text-warn">
          Нет «Вес готового блюда» — пересчитывается весь рецепт, а не порции.
        </p>
      </div>
      <div class="markdown" v-html="html" />
      <p v-if="!recipe.ingredients.length" class="text-[13px] text-warn">
        Ингредиенты не найдены — рецепт не попадёт в список покупок.
      </p>
    </article>
  </section>
</template>
