import { defineStore } from 'pinia';
import { computed } from 'vue';
import { db, save } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import { buildCatalog } from '@/lib/matching';
import type { Pantry } from '@/lib/types';
import { useRecipesStore } from './recipes';
import { useSetsStore } from './sets';

const ID = 'home';
// раньше список хранился только на устройстве: сначала по дням, потом общий
const LOCAL_KEYS = ['pantry-home', 'pantry'];

/** Переносит список с устройства в базу один раз, если в базе (и на других устройствах) его ещё нет. */
async function migrateLocal() {
  try {
    const local = LOCAL_KEYS.map((k) => localStorage.getItem(k));
    if (local.every((v) => v == null)) return;
    if (!(await db.pantry.get(ID))) {
      const [home, byDate] = local.map((v) => (v ? JSON.parse(v) : null));
      const items: string[] = home ?? [...new Set(Object.values((byDate ?? {}) as Record<string, string[]>).flat())];
      if (items.length) await save('pantry', [{ id: ID, items }]);
    }
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  } catch {
    /* старый список не прочитался — выберут заново */
  }
}

/**
 * Продукты, которые есть дома: один список, выбирается на главной и действует на все дни меню.
 * Синхронизируется между устройствами вместе с остальными данными.
 */
export const usePantryStore = defineStore('pantry', () => {
  const recipes = useRecipesStore();
  const sets = useSetsStore();

  void migrateLocal();

  const row = useLiveQuery<Pantry | undefined>(() => db.pantry.get(ID), undefined);
  const items = computed(() => (row.value && !(row.value as { deleted?: boolean }).deleted ? row.value.items : []));
  const catalog = computed(() => buildCatalog(sets.sets, recipes.byId));
  const names = computed(() => new Map(catalog.value.map((p) => [p.key, p.name])));

  const nameOf = (key: string) => names.value.get(key) ?? key;
  const set = (keys: string[]) => save('pantry', [{ id: ID, items: [...keys] }]);

  return { catalog, items, set, nameOf };
});
