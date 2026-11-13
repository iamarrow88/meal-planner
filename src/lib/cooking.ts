import { needId, type Coverage, type Need } from './leftovers';
import { normalizeUnit } from './parse';
import { formatQuantity } from './portions';
import { displayName, isPantryStaple, productBase, selectedOptions } from './shopping';
import { MEALS, type DayPlan, type Meal, type MealSet, type Recipe } from './types';

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
    item.weighable ||= weighable;
    if (!item.when.some((w) => w.date === date && w.meal === meal)) item.when.push({ date, meal });
    item.open ||= open;
  };

  const counted = new Set<string>();
  for (const n of needs) {
    if (!inRange(n.date)) continue;
    counted.add(needId(n));
    const c = coverage(n);
    add(n.recipeId, n.date, n.meal, true, !c || (!c.closed && c.missing > 0));
  }
  // блюда без веса порции (нет веса готового блюда или порция не в граммах) в остатках не участвуют —
  // берём их прямо из меню; из списка такие сами не уходят
  for (const day of days) {
    if (!inRange(day.date)) continue;
    for (const meal of MEALS) {
      const choice = day.meals[meal];
      const set = choice && sets.get(choice.setId);
      if (!choice || !set) continue;
      for (const group of set.groups)
        for (const option of selectedOptions(group, choice)) {
          if (!option.recipe || counted.has(needId({ date: day.date, meal, groupId: group.id, optionId: option.id }))) continue;
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

/** Приёмы пищи этого дня, где рецепт нужен и ещё не покрыт остатками. */
export function openOn(needs: Need[], coverage: (n: Need) => Coverage | undefined, recipeId: string, date: string): Meal[] {
  return needs
    .filter((n) => n.recipeId === recipeId && n.date === date)
    .filter((n) => {
      const c = coverage(n);
      return !c || (!c.closed && c.missing > 0);
    })
    .map((n) => n.meal);
}

/** Продукт, который нужен нескольким рецептам: «Яйца — 5 шт: Кекс 2 шт, Салат 3 шт». */
export interface SharedLine {
  name: string;
  /** Сумма по единицам: «150 г + 1 шт»; пусто, если количеств нет («по вкусу»). */
  total: string;
  parts: { recipeId: string; title: string; amount: string }[];
}

type Amounts = Map<string, number>; // единица → количество

const join = (amounts: Amounts) => [...amounts].map(([unit, n]) => formatQuantity(n, unit)).join(' + ');
/** кг и л переводятся в г и мл, «шт.» — в «шт»: так одно и то же складывается. */
const BASE: Record<string, [string, number]> = { кг: ['г', 1000], л: ['мл', 1000] };
const addTo = (amounts: Amounts, rawUnit: string, n: number) => {
  const unit = normalizeUnit(rawUnit);
  const [base, k] = BASE[unit] ?? [unit, 1];
  amounts.set(base, (amounts.get(base) ?? 0) + n * k);
};

/** Продукты (кроме соли, воды и специй), которые встречаются в двух и больше рецептах, с количествами на нужные порции (factor). */
export function sharedIngredients(items: { recipe: Recipe; factor: number }[]): SharedLine[] {
  const byProduct = new Map<string, { name: string; total: Amounts; parts: Map<string, { title: string; amounts: Amounts }> }>();
  for (const { recipe, factor } of items) {
    for (const ing of recipe.ingredients) {
      const key = productBase(ing.name);
      if (!key || isPantryStaple(ing.name)) continue; // соль, вода, специи — объединять нечего
      let line = byProduct.get(key);
      if (!line) byProduct.set(key, (line = { name: displayName(ing.name), total: new Map(), parts: new Map() }));
      let part = line.parts.get(recipe.id);
      if (!part) line.parts.set(recipe.id, (part = { title: recipe.title, amounts: new Map() }));
      if (ing.amount == null) continue;
      addTo(part.amounts, ing.unit, ing.amount * factor);
      addTo(line.total, ing.unit, ing.amount * factor);
    }
  }
  return [...byProduct.values()]
    .filter((l) => l.parts.size >= 2)
    .map((l) => ({
      name: l.name,
      total: join(l.total),
      parts: [...l.parts].map(([recipeId, p]) => ({ recipeId, title: p.title, amount: join(p.amounts) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
