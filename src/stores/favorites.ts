import { defineStore } from 'pinia';
import { computed } from 'vue';
import { db, markDeleted, save } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { Favorite } from '@/lib/types';

/** Избранные сеты хранятся отдельно от самих сетов, поэтому повторный импорт папки их не сбрасывает. */
export const useFavoritesStore = defineStore('favorites', () => {
  const rows = useLiveQuery<Favorite[]>(() => db.favorites.filter((f) => !f.deleted).toArray(), []);
  const ids = computed(() => new Set(rows.value.map((f) => f.id)));

  const has = (setId: string) => ids.value.has(setId);
  const toggle = (setId: string) => (has(setId) ? markDeleted('favorites', [setId]) : save('favorites', [{ id: setId }]));

  return { has, toggle };
});
