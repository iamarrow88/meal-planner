import { defineStore } from 'pinia';
import { computed } from 'vue';
import { db, markDeleted, save } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { Rating } from '@/lib/types';

export type Rated = 'set' | 'recipe';

/** Оценки сетов и рецептов (1–5 звёзд). Хранятся отдельно, поэтому повторный импорт папки их не сбрасывает. */
export const useRatingsStore = defineStore('ratings', () => {
  const rows = useLiveQuery<Rating[]>(() => db.ratings.filter((r) => !r.deleted).toArray(), []);
  const byId = computed(() => new Map(rows.value.map((r) => [r.id, r.stars])));

  const get = (kind: Rated, id: string) => byId.value.get(`${kind}:${id}`);
  const ofSet = (id: string) => get('set', id);
  const ofRecipe = (id: string) => get('recipe', id);

  /** Та же звезда ещё раз — оценка снимается. */
  function rate(kind: Rated, id: string, stars: number) {
    const key = `${kind}:${id}`;
    return get(kind, id) === stars ? markDeleted('ratings', [key]) : save('ratings', [{ id: key, stars }]);
  }

  return { get, ofSet, ofRecipe, rate };
});
