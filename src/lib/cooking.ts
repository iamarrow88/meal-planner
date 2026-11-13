import type { Coverage, Need } from './leftovers';
import { selectedOptions } from './shopping';
import { MEALS, type DayPlan, type Meal, type MealSet } from './types';

/** Рецепт, который нужно приготовить к выбранным дням. */
export interface CookItem {
  recipeId: string;
  /** Когда нужен: по датам и приёмам пищи. */
  when: { date: string; meal: Meal }[];
  /** Можно ли посчитать в граммах (есть вес порции) — тогда его можно записать в приготовленное. */
  weighable: boolean;
}

const byWhen = (a: { date: string; meal: Meal }, b: { date: string; meal: Meal }) =>
  a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal);

/**
 * Что готовить с from по until: рецепты, которые нужны в эти дни и ещё не покрыты остатками
 * (todo, по порядку первого приёма пищи), и рецепты, которые к этим дням уже приготовлены (cooked).
 */
export function cookList(args: {
  days: DayPlan[];
  sets: Map<string, MealSet>;
  needs: Need[];
  coverage: (n: Need) => Coverage | undefined;
  from: string;
  until: string;
}): { todo: CookItem[]; cooked: string[] } {
  const { days, sets, needs, coverage, from, until } = args;
  const inRange = (date: string) => date >= from && date <= until;
  const items = new Map<string, CookItem & { open: boolean }>();

  const add = (recipeId: string, date: string, meal: Meal, weighable: boolean, open: boolean) => {
    let item = items.get(recipeId);
    if (!item) items.set(recipeId, (item = { recipeId, when: [], weighable, open: false }));
    if (!item.when.some((w) => w.date === date && w.meal === meal)) item.when.push({ date, meal });
    item.open ||= open;
  };

  for (const n of needs) {
    if (!inRange(n.date)) continue;
    const c = coverage(n);
    add(n.recipeId, n.date, n.meal, true, !c || (!c.closed && c.missing > 0));
  }
  // блюда без веса порции в остатках не участвуют — берём их прямо из меню
  for (const day of days) {
    if (!inRange(day.date)) continue;
    for (const meal of MEALS) {
      const choice = day.meals[meal];
      const set = choice && sets.get(choice.setId);
      if (!choice || !set) continue;
      for (const group of set.groups)
        for (const option of selectedOptions(group, choice)) {
          if (!option.recipe || items.get(option.recipe)?.weighable) continue;
          add(option.recipe, day.date, meal, false, true);
        }
    }
  }

  const sorted = [...items.values()]
    .map((i) => ({ ...i, when: [...i.when].sort(byWhen) }))
    .sort((a, b) => byWhen(a.when[0], b.when[0]) || a.recipeId.localeCompare(b.recipeId));
  return {
    todo: sorted.filter((i) => i.open).map(({ open: _, ...item }) => item),
    cooked: sorted.filter((i) => !i.open).map((i) => i.recipeId),
  };
}
