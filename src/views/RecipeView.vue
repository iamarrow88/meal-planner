<script setup lang="ts">
import { marked } from 'marked';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CookPanel from '@/components/CookPanel.vue';
import StarRating from '@/components/StarRating.vue';
import { scaleIngredientsSection } from '@/lib/portions';
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

const factor = ref(1); // во сколько раз умножить ингредиенты — задаёт CookPanel

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
      <CookPanel v-if="recipe.ingredients.length" v-model:factor="factor" :recipe="recipe" />
      <div class="markdown" v-html="html" />
      <p v-if="!recipe.ingredients.length" class="text-[13px] text-warn">
        Ингредиенты не найдены — рецепт не попадёт в список покупок.
      </p>
    </article>
  </section>
</template>
