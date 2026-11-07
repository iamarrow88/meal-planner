import { defineStore } from 'pinia';
import { computed } from 'vue';
import { db } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { Recipe } from '@/lib/types';

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = useLiveQuery<Recipe[]>(
    () => db.recipes.orderBy('title').filter((r) => !r.deleted && Array.isArray(r.meals)).toArray(),
    [],
  );
  const byId = computed(() => new Map(recipes.value.map((r) => [r.id, r])));

  return { recipes, byId };
});
