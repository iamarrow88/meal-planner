<script setup lang="ts">
import { computed, ref } from 'vue';
import AddToMenu from '@/components/AddToMenu.vue';
import StarRating from '@/components/StarRating.vue';
import { MEALS, MEAL_LABELS, type Meal } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { useSetsStore } from '@/stores/sets';

const store = useSetsStore();
const favorites = useFavoritesStore();
const filter = ref<Meal>('breakfast');
const onlyFavorites = ref(false);
const query = ref('');

const inFilter = (meal: Meal) =>
  store.sets.filter((s) => s.meal === meal && (!onlyFavorites.value || favorites.has(s.id)));
const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return inFilter(filter.value).filter((s) => !q || s.name.toLowerCase().includes(q));
});
</script>

<template>
  <section class="flex flex-col gap-3">
    <p v-if="!store.sets.length" class="py-6 text-center text-muted">
      Сетов пока нет. Загрузите папку из Obsidian на вкладке
      <RouterLink to="/data" class="text-accent">«Данные»</RouterLink>.
    </p>
    <template v-else>
      <input v-model="query" type="search" placeholder="Поиск по названию" />
      <div class="flex flex-wrap gap-1.5">
        <button v-for="m in MEALS" :key="m" class="chip" :class="{ 'chip-on': filter === m }" @click="filter = m">
          {{ MEAL_LABELS[m] }} ({{ inFilter(m).length }})
        </button>
        <button class="chip" :class="{ 'chip-on': onlyFavorites }" @click="onlyFavorites = !onlyFavorites">
          ★ Избранное
        </button>
      </div>
      <p v-if="!visible.length" class="py-6 text-center text-muted">Ничего не найдено</p>
      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="s in visible" :key="s.id" class="card flex items-start gap-2 py-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <RouterLink :to="{ name: 'set', params: { id: s.id } }" class="flex flex-col gap-0.5">
              <span class="font-semibold">{{ s.name }}</span>
              <StarRating kind="set" :id="s.id" readonly />
              <span class="hint">{{ s.groups.map((g) => g.title).join(' · ') }}</span>
            </RouterLink>
            <AddToMenu :set="s" small />
          </div>
          <button
            class="shrink-0 cursor-pointer px-1 text-xl text-accent"
            :aria-label="favorites.has(s.id) ? 'Убрать из избранного' : 'Добавить в избранное'"
            :aria-pressed="favorites.has(s.id)"
            @click="favorites.toggle(s.id)"
          >
            {{ favorites.has(s.id) ? '★' : '☆' }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>
