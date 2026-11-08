import { addDays } from './dates';
import { selectedOptions } from './shopping';
import type { DayPlan, MealSet, Recipe } from './types';

/** Совет дня: рецепт, который давно не готовили, или который ещё ни разу не был в меню. */
export type Tip =
  | { kind: 'forgotten'; recipe: Recipe; last: string; sets: MealSet[] }
  | { kind: 'new'; recipe: Recipe; sets: MealSet[] };

/** Сколько дней без блюда считается «давно». */
export const FORGOTTEN_AFTER = 14;

/** Число из даты: один и тот же совет весь день, на следующий день — другой. */
function seed(date: string) {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Все советы по порядку, начиная с сегодняшнего: «давно не ели» и «не пробовали» чередуются.
 * Учитываются рецепты, которые выбраны в сетах меню (сам сет или выбранный в нём вариант).
 */
export function dailyTips(days: DayPlan[], sets: Map<string, MealSet>, recipes: Recipe[], today: string): Tip[] {
  const last = new Map<string, string>(); // рецепт → последний прошедший день, когда он был в меню
  const planned = new Set<string>(); // рецепты, которые были или будут в меню
  const upcoming = new Set<string>(); // уже стоят в меню после сегодняшнего дня
  for (const day of days) {
    for (const choice of Object.values(day.meals)) {
      const set = choice && sets.get(choice.setId);
      if (!choice || !set) continue;
      for (const group of set.groups) {
        for (const option of selectedOptions(group, choice)) {
          if (!option.recipe) continue;
          planned.add(option.recipe);
          if (day.date > today) upcoming.add(option.recipe);
          if (day.date <= today && (last.get(option.recipe) ?? '') < day.date) last.set(option.recipe, day.date);
        }
      }
    }
  }

  // в каких сетах встречается рецепт — оттуда его можно поставить в меню
  const setsOf = new Map<string, MealSet[]>();
  for (const set of sets.values()) {
    for (const group of set.groups) {
      for (const option of group.options) {
        if (!option.recipe) continue;
        const list = setsOf.get(option.recipe) ?? [];
        if (!list.includes(set)) list.push(set);
        setsOf.set(option.recipe, list);
      }
    }
  }

  const limit = addDays(today, -FORGOTTEN_AFTER);
  const forgotten: Tip[] = recipes
    .filter((r) => {
      const d = last.get(r.id);
      // уже стоит в меню на будущее — напоминать не о чем
      return !!d && d <= limit && !upcoming.has(r.id);
    })
    .sort((a, b) => last.get(a.id)!.localeCompare(last.get(b.id)!))
    .map((recipe) => ({ kind: 'forgotten', recipe, last: last.get(recipe.id)!, sets: setsOf.get(recipe.id) ?? [] }));
  const fresh: Tip[] = recipes
    .filter((r) => !planned.has(r.id))
    .map((recipe) => ({ kind: 'new', recipe, sets: setsOf.get(recipe.id) ?? [] }));

  // «давно не ели» — от самых забытых; «не пробовали» — перемешаны по дате, чтобы каждый день был новый рецепт
  const shift = fresh.length ? seed(today) % fresh.length : 0;
  const rotated = [...fresh.slice(shift), ...fresh.slice(0, shift)];
  // каждый второй день начинаем с нового рецепта
  const [first, second] = seed(today) % 2 ? [rotated, forgotten] : [forgotten, rotated];
  const tips: Tip[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (first[i]) tips.push(first[i]);
    if (second[i]) tips.push(second[i]);
  }
  return tips;
}

