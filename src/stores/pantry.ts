import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { buildCatalog } from '@/lib/matching';
import { useRecipesStore } from './recipes';
import { useSetsStore } from './sets';

const STORAGE_KEY = 'pantry-home';
const OLD_KEY = 'pantry'; // раньше продукты выбирались отдельно для каждого дня

function load(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    // переход со старого вида: всё, что выбирали по дням, становится общим списком
    const byDate: Record<string, string[]> = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}');
    return [...new Set(Object.values(byDate).flat())];
  } catch {
    return [];
  }
}

/**
 * Продукты, которые есть дома: один список, выбирается на главной и действует на все дни меню.
 * Хранится только на этом устройстве: это подсказка для подбора сетов, а не часть меню.
 */
export const usePantryStore = defineStore('pantry', () => {
  const recipes = useRecipesStore();
  const sets = useSetsStore();

  const items = ref<string[]>(load());
  const catalog = computed(() => buildCatalog(sets.sets, recipes.byId));
  const names = computed(() => new Map(catalog.value.map((p) => [p.key, p.name])));

  const nameOf = (key: string) => names.value.get(key) ?? key;

  function set(keys: string[]) {
    items.value = keys;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      localStorage.removeItem(OLD_KEY);
    } catch {
      /* хранилище недоступно — список продержится до перезагрузки */
    }
  }

  return { catalog, items, set, nameOf };
});
