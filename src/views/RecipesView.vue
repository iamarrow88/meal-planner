<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuRecipes from '@/components/MenuRecipes.vue';
import StarRating from '@/components/StarRating.vue';
import { MEALS, MEAL_LABELS, type Meal } from '@/lib/types';
import { useRecipesStore } from '@/stores/recipes';

const store = useRecipesStore();
const route = useRoute();
const router = useRouter();
// вкладка в адресе: «назад» со страницы рецепта вернёт туда же
const tab = computed(() => (route.query.tab === 'all' ? 'all' : 'menu'));
const setTab = (t: 'menu' | 'all') => router.replace({ query: t === 'all' ? { tab: 'all' } : {} });
const filter = ref<Meal | 'all'>('all');
const query = ref('');

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return store.recipes.filter(
    (r) =>
      (filter.value === 'all' || r.meals.includes(filter.value)) &&
      (!q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q))),
  );
});

const countFor = (meal: Meal) => store.recipes.filter((r) => r.meals.includes(meal)).length;
</script>

<template>
  <section class="flex flex-col gap-3">
    <p v-if="!store.recipes.length" class="py-6 text-center text-muted">
      Рецептов пока нет. Загрузите папку из Obsidian на вкладке
      <RouterLink to="/data" class="text-accent">«Данные»</RouterLink>.
    </p>
    <template v-else>
      <div class="flex gap-1.5" role="tablist">
        <button
          class="chip"
          role="tab"
          :aria-selected="tab === 'menu'"
          :class="{ 'chip-on': tab === 'menu' }"
          @click="setTab('menu')"
        >
          В меню
        </button>
        <button
          class="chip"
          role="tab"
          :aria-selected="tab === 'all'"
          :class="{ 'chip-on': tab === 'all' }"
          @click="setTab('all')"
        >
          Все рецепты
        </button>
      </div>
      <MenuRecipes v-if="tab === 'menu'" />
      <template v-else>
        <div class="flex flex-col gap-2">
          <input v-model="query" type="search" placeholder="Поиск по названию или тегу" />
          <div class="flex flex-wrap gap-1.5">
            <button class="chip" :class="{ 'chip-on': filter === 'all' }" @click="filter = 'all'">
              Все ({{ store.recipes.length }})
            </button>
            <button v-for="m in MEALS" :key="m" class="chip" :class="{ 'chip-on': filter === m }" @click="filter = m">
              {{ MEAL_LABELS[m] }} ({{ countFor(m) }})
            </button>
          </div>
        </div>

        <p v-if="!visible.length" class="py-6 text-center text-muted">Ничего не найдено</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="r in visible" :key="r.id">
            <RouterLink :to="{ name: 'recipe', params: { id: r.id } }" class="card flex flex-col gap-0.5 py-3">
              <span class="font-semibold">{{ r.title }}</span>
              <StarRating kind="recipe" :id="r.id" readonly />
              <span class="hint">
                {{ r.meals.map((m) => MEAL_LABELS[m]).join(', ') }}<template v-if="r.time"> · {{ r.time }}</template>
              </span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>
