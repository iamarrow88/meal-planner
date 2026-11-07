<script setup lang="ts">
import { marked } from 'marked';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MEAL_LABELS } from '@/lib/types';
import { useRecipesStore } from '@/stores/recipes';

const props = defineProps<{ id: string }>();
const store = useRecipesStore();
const route = useRoute();
const router = useRouter();
const fromShopping = computed(() => route.query.from === 'shopping');

// «назад» возвращает на то же место списка; если рецепт открыт по сохранённой ссылке — просто в покупки
function back() {
  if (window.history.state?.back) router.back();
  else router.push('/shopping');
}

const recipe = computed(() => store.byId.get(props.id));
const html = computed(() => (recipe.value ? (marked.parse(recipe.value.body) as string) : ''));
</script>

<template>
  <section class="flex flex-col gap-3">
    <button v-if="fromShopping" class="link self-start" @click="back">‹ Список покупок</button>
    <RouterLink v-else to="/recipes" class="link">‹ Все рецепты</RouterLink>
    <p v-if="!recipe" class="py-6 text-center text-muted">Рецепт не найден.</p>
    <article v-else class="card">
      <div class="hint">
        {{ recipe.meals.map((m) => MEAL_LABELS[m]).join(', ') }}
        <template v-if="recipe.time"> · {{ recipe.time }}</template>
      </div>
      <h2 class="mt-1.5 text-[22px] font-bold">{{ recipe.title }}</h2>
      <div class="markdown" v-html="html" />
      <p v-if="!recipe.ingredients.length" class="text-[13px] text-warn">
        Ингредиенты не найдены — рецепт не попадёт в список покупок.
      </p>
    </article>
  </section>
</template>
