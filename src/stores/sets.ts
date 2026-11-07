import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { db } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { MealChoice, MealSet } from '@/lib/types';

const collator = new Intl.Collator('ru', { numeric: true });

export const useSetsStore = defineStore('sets', () => {
  const rows = useLiveQuery<MealSet[]>(
    () => db.sets.filter((s) => !s.deleted && Array.isArray(s.groups)).toArray(),
    [],
  );
  // с numeric В2 идёт раньше В10
  const sets = computed(() => [...rows.value].sort((a, b) => collator.compare(a.name, b.name)));
  const byId = computed(() => new Map(sets.value.map((s) => [s.id, s])));

  // выбор на странице сета: не теряется, если заглянуть в рецепт и вернуться
  const drafts = ref<Record<string, MealChoice['picks']>>({});

  return { sets, byId, drafts };
});
