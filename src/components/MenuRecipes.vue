<script setup lang="ts">
import { marked } from 'marked';
import { computed, reactive, ref } from 'vue';
import CookPanel from '@/components/CookPanel.vue';
import { cookList, sharedIngredients } from '@/lib/cooking';
import { addDays, formatDay, range, today } from '@/lib/dates';
import { scaleIngredientsSection } from '@/lib/portions';
import { MEAL_LABELS, type Meal } from '@/lib/types';
import { useLeftoversStore } from '@/stores/leftovers';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

/**
 * Рецепты из меню, которые нужно приготовить с завтра по выбранный день: развёрнутые, пересчитанные
 * на нужные порции, и сводка продуктов, общих для нескольких рецептов, — чтобы готовить всё разом.
 */
const leftovers = useLeftoversStore();
const recipes = useRecipesStore();
const sets = useSetsStore();

const DEFAULT_DAYS = 4;
const CHOICE_DAYS = 7; // не зависит от недели, открытой в «Меню»
const shortDay = (iso: string) => formatDay(iso).replace(/,.*$/, '');

const from = computed(() => addDays(today(), 1));
const chips = computed(() => range(from.value, CHOICE_DAYS));
const chosen = ref<string | null>(null);
const until = computed(() =>
  chosen.value && chips.value.includes(chosen.value) ? chosen.value : chips.value[DEFAULT_DAYS - 1],
);

const list = computed(() =>
  cookList({
    days: leftovers.days,
    sets: sets.byId,
    needs: leftovers.needs,
    coverage: leftovers.coverageOf,
    from: from.value,
    until: until.value,
  }),
);

const todo = computed(() =>
  list.value.todo.flatMap((item) => {
    const recipe = recipes.byId.get(item.recipeId);
    return recipe ? [{ ...item, recipe }] : [];
  }),
);
const cooked = computed(() => list.value.cooked.flatMap((id) => recipes.byId.get(id) ?? []));

/** Во сколько раз умножить каждый рецепт — задают счётчики порций. */
const factors = reactive<Record<string, number>>({});
const shared = computed(() =>
  sharedIngredients(
    todo.value.map((i) => ({
      recipe: i.recipe,
      factor: factors[i.recipeId] ?? 1,
    })),
  ),
);

const collapsed = reactive<Record<string, boolean>>({});

const whenLabel = (when: { date: string; meal: Meal }[]) =>
  when.map((w) => `${shortDay(w.date)} ${MEAL_LABELS[w.meal].toLowerCase()}`).join(', ');

const html = (id: string, body: string) => marked.parse(scaleIngredientsSection(body, factors[id] ?? 1)) as string;
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <span class="font-medium">Готовлю до:</span>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="d in chips" :key="d" class="chip" :class="{ 'chip-on': d === until }" @click="chosen = d">
          {{ shortDay(d) }}
        </button>
      </div>
      <span class="hint">Рецепты меню с завтра по {{ formatDay(until) }}, которые ещё не приготовлены.</span>
    </div>

    <div v-if="shared.length" class="card flex flex-col gap-1">
      <span class="font-semibold">Общее для нескольких рецептов</span>
      <p v-for="line in shared" :key="line.name" class="text-[15px]">
        <span class="font-medium">{{ line.name }}</span><template v-if="line.total"> — {{ line.total }}</template
        >:
        <span class="text-muted">
          {{ line.parts.map((p) => (p.amount ? `${p.title} ${p.amount}` : p.title)).join(', ') }}
        </span>
      </p>
    </div>

    <article v-for="item in todo" :key="item.recipeId" class="card">
      <button
        class="flex w-full items-start gap-2 text-left"
        :aria-expanded="!collapsed[item.recipeId]"
        @click="collapsed[item.recipeId] = !collapsed[item.recipeId]"
      >
        <span class="mt-0.5 text-muted">{{ collapsed[item.recipeId] ? '▸' : '▾' }}</span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-[18px] font-bold">{{ item.recipe.title }}</span>
          <span class="hint">нужно к: {{ whenLabel(item.when) }}</span>
        </span>
      </button>
      <div v-show="!collapsed[item.recipeId]">
        <RouterLink :to="{ name: 'recipe', params: { id: item.recipeId } }" class="link mt-1 inline-block text-[13px]">
          Открыть рецепт
        </RouterLink>
        <CookPanel
          v-if="item.recipe.ingredients.length"
          v-model:factor="factors[item.recipeId]"
          :recipe="item.recipe"
          :from="from"
          :until="until"
        />
        <div class="markdown" v-html="html(item.recipeId, item.recipe.body)" />
      </div>
    </article>

    <p v-if="!todo.length" class="py-4 text-center text-muted">
      {{ cooked.length ? 'К этим дням всё приготовлено.' : 'В меню на эти дни нет рецептов.' }}
      <RouterLink :to="{ name: 'recipes', query: { tab: 'all' } }" class="text-accent">Все рецепты</RouterLink>
    </p>

    <p v-if="cooked.length" class="hint">
      Уже приготовлено к этим дням:
      <template v-for="(r, i) in cooked" :key="r.id">
        <template v-if="i">, </template>
        <RouterLink :to="{ name: 'recipe', params: { id: r.id } }" class="link">{{ r.title }}</RouterLink>
      </template>
    </p>
  </div>
</template>
