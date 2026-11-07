import type { DayPlan, Ingredient, MealChoice, MealSet, Recipe, SetGroup, SetOption } from './types';

export interface ShoppingLine {
  key: string;
  name: string;
  unit: string;
  amount: number | null;
  notes: string[];
  dishes: Dish[];
}

/** Откуда продукт: сет или рецепт (на рецепт можно перейти). */
export interface Dish {
  title: string;
  recipe?: string;
}

export const formatAmount = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function describeLine(l: ShoppingLine) {
  return l.amount != null ? `${formatAmount(l.amount)} ${l.unit}`.trim() : l.notes.join(', ');
}

/** По этому ключу продукты складываются: «Мука», «мука» и «мёд»/«мед» — один продукт. */
const productKey = (name: string) => name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Заглавная только первая буква; остальное как в заметке, чтобы не портить «(C1)» или «Hochland». */
const displayName = (name: string) => {
  const s = name.replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Что выбрано в группе; группа без выбора входит в сет целиком. */
export function selectedOptions(group: SetGroup, choice: MealChoice): SetOption[] {
  if (group.pick === 0) return group.options;
  const ids = choice.picks?.[group.id] ?? [];
  return group.options.filter((o) => ids.includes(o.id));
}

/** Какая доля рецепта нужна; null — порция в граммах, но вес готового блюда неизвестен. */
function recipeShare(option: SetOption, recipe: Recipe): number | null {
  if (option.fraction) return option.fraction;
  if (!option.portion) return 1;
  if (option.portion.unit === 'г' && recipe.yieldGrams) return option.portion.amount / recipe.yieldGrams;
  return null;
}

/** Складывает продукты всех выбранных блюд; `people` умножает количество. */
export function buildShoppingList(
  days: DayPlan[],
  sets: Map<string, MealSet>,
  recipes: Map<string, Recipe>,
  people: number,
) {
  const map = new Map<string, ShoppingLine>();
  const noIngredients = new Set<string>();
  const wholeRecipe = new Set<string>();

  const add = (ing: Ingredient, factor: number, dish: Dish) => {
    const key = `${productKey(ing.name)}|${ing.amount == null ? '' : ing.unit}`;
    const line = map.get(key) ?? { key, name: displayName(ing.name), unit: ing.unit, amount: null, notes: [], dishes: [] };
    if (ing.amount != null) line.amount = (line.amount ?? 0) + ing.amount * factor;
    else if (ing.note && !line.notes.includes(ing.note)) line.notes.push(ing.note);
    if (!line.dishes.some((d) => d.title === dish.title)) line.dishes.push(dish);
    map.set(key, line);
  };

  for (const day of days) {
    for (const choice of Object.values(day.meals)) {
      const set = choice && sets.get(choice.setId);
      if (!choice || !set) continue;
      for (const group of set.groups) {
        const selected = selectedOptions(group, choice);
        if (!selected.length) continue;
        const factor = people * (group.halves && selected.length === 2 ? 0.5 : 1);
        for (const ing of group.common) add(ing, people, { title: set.name });
        for (const option of selected) {
          // у варианта с рецептом это продукты сверх рецепта: «[[Борщ]] + сметана 10 гр»
          for (const ing of option.items) add(ing, factor, { title: set.name });
          const recipe = option.recipe ? recipes.get(option.recipe) : undefined;
          if (!recipe) continue;
          if (!recipe.ingredients.length) noIngredients.add(recipe.title);
          const share = recipeShare(option, recipe);
          if (share == null) wholeRecipe.add(recipe.title);
          for (const ing of recipe.ingredients) add(ing, factor * (share ?? 1), { title: recipe.title, recipe: recipe.id });
        }
      }
    }
  }

  return {
    lines: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    noIngredients: [...noIngredients],
    wholeRecipe: [...wholeRecipe],
  };
}
