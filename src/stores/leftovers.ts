import { defineStore } from 'pinia';
import { computed } from 'vue';
import { today } from '@/lib/dates';
import { db, save, type SyncMeta } from '@/lib/db';
import { distribute, eatenOf, mealNeeds, needId, splitEaten, type Coverage, type Need } from '@/lib/leftovers';
import { useLiveQuery } from '@/lib/live';
import type { DayPlan, Leftover } from '@/lib/types';
import { useRecipesStore } from './recipes';
import { useSetsStore } from './sets';
import { useSettingsStore } from './settings';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // IndexedDB не принимает reactive-прокси

/**
 * Остатки приготовленного: партии и то, как они распределяются по блюдам меню.
 * Учитываются все дни меню, а не только открытый период: партию могут доедать и на следующей неделе.
 */
export const useLeftoversStore = defineStore('leftovers', () => {
  const recipes = useRecipesStore();
  const sets = useSetsStore();
  const settings = useSettingsStore();

  const rows = useLiveQuery<(Leftover & SyncMeta)[]>(() => db.leftovers.filter((b) => !b.deleted).toArray(), []);
  const days = useLiveQuery<DayPlan[]>(() => db.days.filter((d) => !d.deleted).toArray(), []);

  const batches = computed(() => rows.value as Leftover[]);
  const needs = computed(() => mealNeeds(days.value, sets.byId, recipes.byId, settings.people));
  const state = computed(() => distribute(batches.value, needs.value));

  const coverageOf = (need: Need): Coverage | undefined => state.value.coverage.get(needId(need));
  const needsOf = (date: string) => needs.value.filter((n) => n.date === date);
  /** Партии с остатком, старшие первыми. */
  const available = computed(() => state.value.batches.filter((s) => s.left > 0));
  /** Сколько свободно (не занято меню) по рецепту. */
  const freeByRecipe = computed(() => {
    const m = new Map<string, number>();
    for (const s of state.value.batches) m.set(s.batch.recipeId, (m.get(s.batch.recipeId) ?? 0) + s.free);
    return m;
  });

  const put = (b: Leftover) => save('leftovers', [plain(b)]);
  const byId = (id: string) => batches.value.find((b) => b.id === id);

  async function cook(recipeId: string, grams: number) {
    await put({ id: crypto.randomUUID(), recipeId, cookedAt: today(), grams: Math.round(grams), adjust: 0, eaten: [] });
  }

  /** «Выбросили»: списать граммы (не больше, чем лежит). */
  async function discard(id: string, grams: number) {
    const s = state.value.batches.find((x) => x.batch.id === id);
    if (!s) return;
    await put({ ...s.batch, adjust: (s.batch.adjust || 0) + Math.min(Math.max(0, grams), s.left) });
  }

  /** «Взвесила: осталось N г» — поправка подбирается так, чтобы остаток стал N. */
  async function weigh(id: string, gramsLeft: number) {
    const b = byId(id);
    if (!b) return;
    const eaten = b.eaten.reduce((s, e) => s + e.grams, 0);
    await put({ ...b, adjust: b.grams - eaten - Math.max(0, Math.round(gramsLeft)) });
  }

  /** «Съедено»: записывает граммы в партии, старшие первыми. */
  async function eat(need: Need, grams: number) {
    const parts = splitEaten(state.value.batches, need, grams);
    const changed = parts.map(({ batchId, grams: g }) => {
      const b = byId(batchId)!;
      return { ...b, eaten: [...b.eaten, { date: need.date, meal: need.meal, grams: Math.round(g) }] };
    });
    if (changed.length) await save('leftovers', plain(changed));
  }

  /** Снять отметку «Съедено» с приёма пищи. */
  async function uneat(need: Need) {
    const changed = batches.value
      .filter((b) => b.recipeId === need.recipeId && b.eaten.some((e) => e.date === need.date && e.meal === need.meal))
      .map((b) => ({ ...b, eaten: b.eaten.filter((e) => !(e.date === need.date && e.meal === need.meal)) }));
    if (changed.length) await save('leftovers', plain(changed));
  }

  const eatenFor = (need: Need) => eatenOf(batches.value, need);

  return { batches, needs, state, available, freeByRecipe, coverageOf, needsOf, cook, discard, weigh, eat, uneat, eatenFor };
});
