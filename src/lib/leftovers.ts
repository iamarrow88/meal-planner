import { selectedOptions } from './shopping';
import { MEALS, type DayPlan, type Leftover, type Meal, type MealSet, type Recipe, type SetOption } from './types';

/** Ключ варианта в приёме пищи: '<id группы>:<id варианта>'. */
export const optionKey = (groupId: string, optionId: string) => `${groupId}:${optionId}`;

/** Вес одной порции рецепта в варианте сета, г; null — посчитать нельзя. */
export function portionGrams(option: SetOption, recipe: Recipe): number | null {
  if (option.portion) return option.portion.unit === 'г' ? option.portion.amount : null;
  if (!recipe.yieldGrams) return null;
  return recipe.yieldGrams * (option.fraction ?? 1);
}

/** Сколько граммов блюда нужно одному приёму пищи меню. */
export interface Need {
  date: string;
  meal: Meal;
  setId: string;
  groupId: string;
  optionId: string;
  recipeId: string;
  portionGrams: number;
  people: number;
  grams: number;
  /** «Готовлю заново» с этого момента (ISO-время): партии, записанные раньше, не берутся. */
  freshSince?: string;
}

export const needId = (n: Pick<Need, 'date' | 'meal' | 'groupId' | 'optionId'>) =>
  `${n.date}|${n.meal}|${optionKey(n.groupId, n.optionId)}`;

const order = (a: Pick<Need, 'date' | 'meal'>, b: Pick<Need, 'date' | 'meal'>) =>
  a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal);

/** Все блюда с рецептом в меню, для которых можно посчитать граммы, — по датам и приёмам пищи. */
export function mealNeeds(
  days: DayPlan[],
  sets: Map<string, MealSet>,
  recipes: Map<string, Recipe>,
  defaultPeople: number,
): Need[] {
  const result: Need[] = [];
  for (const day of days) {
    for (const meal of MEALS) {
      const choice = day.meals[meal];
      const set = choice && sets.get(choice.setId);
      if (!choice || !set) continue;
      const people = choice.people || defaultPeople || 1;
      for (const group of set.groups) {
        const selected = selectedOptions(group, choice);
        const share = group.halves && selected.length === 2 ? 0.5 : 1;
        for (const option of selected) {
          const recipe = option.recipe ? recipes.get(option.recipe) : undefined;
          const portion = recipe && portionGrams(option, recipe);
          if (!recipe || !portion) continue;
          result.push({
            date: day.date,
            meal,
            setId: set.id,
            groupId: group.id,
            optionId: option.id,
            recipeId: recipe.id,
            portionGrams: portion,
            people,
            grams: portion * share * people,
            freshSince: choice.fresh?.[optionKey(group.id, option.id)],
          });
        }
      }
    }
  }
  return result.sort(order);
}

export interface Coverage {
  /** Съедено по этому приёму пищи (из всех партий). */
  eaten: number;
  /** Занято из остатков. */
  covered: number;
  /** Не хватает остатков — это готовят или покупают. */
  missing: number;
  /** Отмечено «Съедено»: больше ничего не занимает. */
  closed: boolean;
}

export interface BatchState {
  batch: Leftover;
  /** Лежит сейчас. */
  left: number;
  /** Из них занято блюдами в меню. */
  reserved: number;
  free: number;
}

/** Съедено в этот приём пищи из этого рецепта, по всем партиям. */
export function eatenOf(batches: Leftover[], need: Pick<Need, 'date' | 'meal' | 'recipeId'>): number {
  let sum = 0;
  for (const b of batches) {
    if (b.recipeId !== need.recipeId) continue;
    for (const e of b.eaten) if (e.date === need.date && e.meal === need.meal) sum += e.grams;
  }
  return sum;
}

/** Записана ли партия после отметки «готовлю заново». Старые записи без времени сравниваются по дню. */
const after = (b: Leftover, since: string) =>
  b.createdAt != null ? b.createdAt > Date.parse(since) : b.cookedAt > since.slice(0, 10);

const usable = (b: Leftover, need: Pick<Need, 'recipeId' | 'date' | 'freshSince'>) =>
  b.recipeId === need.recipeId && b.cookedAt <= need.date && (!need.freshSince || after(b, need.freshSince));

/** Сколько свободных остатков рецепта годится для приёма пищи в этот день. */
export function freeFor(batches: BatchState[], recipeId: string, date: string): number {
  return batches.filter((s) => usable(s.batch, { recipeId, date })).reduce((sum, s) => sum + s.free, 0);
}

const byAge = (a: Leftover, b: Leftover) => a.cookedAt.localeCompare(b.cookedAt) || a.id.localeCompare(b.id);

/** Распределяет остатки партий по блюдам меню: старшие партии — ранним приёмам пищи. */
export function distribute(batches: Leftover[], needs: Need[]): { batches: BatchState[]; coverage: Map<string, Coverage> } {
  const states: BatchState[] = [...batches].sort(byAge).map((batch) => {
    const eaten = batch.eaten.reduce((s, e) => s + e.grams, 0);
    const left = Math.max(0, batch.grams - (batch.adjust || 0) - eaten);
    return { batch, left, reserved: 0, free: left };
  });
  const coverage = new Map<string, Coverage>();
  for (const need of [...needs].sort(order)) {
    const eaten = eatenOf(batches, need);
    if (eaten > 0) {
      coverage.set(needId(need), { eaten, covered: 0, missing: 0, closed: true });
      continue;
    }
    let rest = need.grams;
    for (const s of states) {
      if (rest <= 0) break;
      if (!usable(s.batch, need) || s.free <= 0) continue;
      const take = Math.min(rest, s.free);
      s.free -= take;
      s.reserved += take;
      rest -= take;
    }
    coverage.set(needId(need), { eaten: 0, covered: need.grams - rest, missing: rest, closed: false });
  }
  return { batches: states, coverage };
}

/** Как разложить «Съедено N г» по партиям: старшие первыми, не больше их остатка. */
export function splitEaten(batches: BatchState[], need: Need, grams: number): { batchId: string; grams: number }[] {
  const parts: { batchId: string; grams: number }[] = [];
  let rest = grams;
  for (const s of [...batches].sort((a, b) => byAge(a.batch, b.batch))) {
    if (rest <= 0) break;
    if (!usable(s.batch, need) || s.left <= 0) continue;
    const take = Math.min(rest, s.left);
    parts.push({ batchId: s.batch.id, grams: take });
    rest -= take;
  }
  return parts;
}
