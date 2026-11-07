import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { buildCatalog } from '@/lib/matching';
import { useRecipesStore } from './recipes';
import { useSetsStore } from './sets';

const STORAGE_KEY = 'pantry';

function load(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Продукты, которые есть дома, — отдельно для каждого дня меню. Хранятся только на этом
 * устройстве: это подсказка для подбора сетов, а не часть меню.
 */
export const usePantryStore = defineStore('pantry', () => {
  const recipes = useRecipesStore();
  const sets = useSetsStore();

  const byDate = ref<Record<string, string[]>>(load());
  const catalog = computed(() => buildCatalog(sets.sets, recipes.byId));
  const names = computed(() => new Map(catalog.value.map((p) => [p.key, p.name])));

  const get = (date: string) => byDate.value[date] ?? [];
  const nameOf = (key: string) => names.value.get(key) ?? key;

  function set(date: string, keys: string[]) {
    const next = { ...byDate.value };
    if (keys.length) next[date] = keys;
    else delete next[date];
    byDate.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* хранилище недоступно — выбор продержится до перезагрузки */
    }
  }

  return { catalog, get, set, nameOf };
});
