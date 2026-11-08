import { displayName, isPantryStaple, isSpice, productBase, splitMarks } from './shopping';
import type { Ingredient, MealChoice, MealSet, Recipe, SetOption } from './types';

/** Продукт для подбора: ключ — слова названия без пометок, name — как показать. */
export interface Product {
  key: string;
  name: string;
}

/** Какие продукты есть в варианте: его собственные и из рецепта, на который он ссылается. */
function optionIngredients(option: SetOption, recipes: Map<string, Recipe>): Ingredient[] {
  const recipe = option.recipe ? recipes.get(option.recipe) : undefined;
  return [...option.items, ...(recipe?.ingredients ?? [])];
}

/** Слово без окончания: «яйца» и «яйцо», «помидоры» и «помидор», «куриное» и «куриный» совпадают. */
const stem = (word: string) => (word.length > 3 ? word.replace(/[аеиоуыэюяйь]+$/, '') : word);

/** Ключ продукта для подбора: слова без пометок и окончаний. */
const productKey = (name: string) => productBase(name).split(' ').map(stem).join(' ');

// отварные крупы в покупки не идут, но «рис» должен находить «рис отварной», поэтому здесь убираем только специи
const keysOf = (ingredients: Ingredient[]) =>
  new Set(ingredients.filter((i) => !isSpice(i.name)).map((i) => productKey(i.name)).filter(Boolean));

// продукты варианта считаются один раз на загруженный набор рецептов, а не при каждой перерисовке
const cache = new WeakMap<Map<string, Recipe>, WeakMap<object, Set<string>>>();
function cached(owner: object, recipes: Map<string, Recipe>, compute: () => Set<string>) {
  let byOwner = cache.get(recipes);
  if (!byOwner) cache.set(recipes, (byOwner = new WeakMap()));
  let keys = byOwner.get(owner);
  if (!keys) byOwner.set(owner, (keys = compute()));
  return keys;
}

const optionKeys = (option: SetOption, recipes: Map<string, Recipe>) =>
  cached(option, recipes, () => keysOf(optionIngredients(option, recipes)));

const setKeys = (set: MealSet, recipes: Map<string, Recipe>) =>
  cached(set, recipes, () => {
    const keys = keysOf(set.groups.flatMap((g) => g.common));
    for (const g of set.groups) for (const o of g.options) for (const k of optionKeys(o, recipes)) keys.add(k);
    return keys;
  });

/** Все продукты из рецептов и сетов — из них выбирают, что есть дома. */
export function buildCatalog(sets: MealSet[], recipes: Map<string, Recipe>): Product[] {
  const names = new Map<string, string>();
  const note = (ingredients: Ingredient[]) => {
    for (const i of ingredients) {
      if (isPantryStaple(i.name)) continue;
      const key = productKey(i.name);
      if (key && !names.has(key)) names.set(key, displayName(splitMarks(i.name).base));
    }
  };
  for (const r of recipes.values()) note(r.ingredients);
  for (const s of sets) for (const g of s.groups) note([...g.common, ...g.options.flatMap((o) => o.items)]);
  return [...names].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** «Творог» подходит к «Мягкий творог 5%», «Куриное филе» — к «Запеченное куриное филе грудки». */
function contains(ingredientKey: string, productKey: string) {
  const words = new Set(ingredientKey.split(' '));
  return productKey.split(' ').every((w) => words.has(w));
}

const matched = (keys: Set<string>, products: string[]) => products.filter((p) => [...keys].some((k) => contains(k, p)));

export interface Suggestion {
  set: MealSet;
  /** Какие из выбранных продуктов есть в сете. */
  products: string[];
  choice: MealChoice;
  /** Что ещё понадобится для выбранных вариантов — в порядке сета и рецептов. */
  missing: string[];
}

/**
 * Продукты сета при таком выборе, кроме тех, что есть дома: по разделам сверху вниз,
 * в каждом варианте — сначала его собственные продукты, потом рецепт по порядку.
 * Разделы, где вариант не выбран, пропускаются: что там понадобится, ещё неизвестно.
 */
function missingProducts(set: MealSet, choice: MealChoice, products: string[], recipes: Map<string, Recipe>) {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (ingredients: Ingredient[]) => {
    for (const i of ingredients) {
      if (isPantryStaple(i.name)) continue;
      const key = productKey(i.name);
      if (!key || seen.has(key) || products.some((p) => contains(key, p))) continue;
      seen.add(key);
      out.push(displayName(splitMarks(i.name).base).toLowerCase());
    }
  };
  for (const group of set.groups) {
    add(group.common);
    const ids = choice.picks[group.id];
    const options = group.pick ? group.options.filter((o) => ids?.includes(o.id)) : group.options;
    for (const option of options) add(optionIngredients(option, recipes));
  }
  return out;
}

const ownKeys = (option: SetOption, recipes: Map<string, Recipe>) => cached(option.items, recipes, () => keysOf(option.items));

/**
 * Насколько вариант подходит: продукт прямо в строке варианта («Отварной рис, 170 г») весит 3,
 * а спрятанный в рецепте («Овощные котлеты», где есть рис) — 1.
 */
function optionScore(option: SetOption, products: string[], recipes: Map<string, Recipe>) {
  const own = matched(ownKeys(option, recipes), products);
  const all = matched(optionKeys(option, recipes), products);
  return own.length * 3 + (all.length - own.length);
}

/**
 * Выбор вариантов под продукты: в каждой группе — варианты, где их больше всего.
 * Если подходящего варианта нет, группа остаётся пустой, и её нужно выбрать вручную.
 */
function autoPicks(set: MealSet, products: string[], recipes: Map<string, Recipe>) {
  const picks: MealChoice['picks'] = {};
  let score = 0;
  for (const group of set.groups) {
    const ranked = group.options
      .map((option) => ({ option, score: optionScore(option, products, recipes) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    // группа без выбора входит в сет целиком — её совпадения тоже идут в оценку сета
    const chosen = group.pick ? ranked.slice(0, group.pick) : ranked;
    if (group.pick && chosen.length) picks[group.id] = chosen.map((r) => r.option.id);
    score += chosen.reduce((sum, r) => sum + r.score, 0);
  }
  return { picks, score };
}

/**
 * Сеты, где встречается больше всего выбранных продуктов, — `limit` штук начиная с `offset`
 * (кнопка «Другие» листает дальше). При равенстве выше те, где продукты указаны прямо в сете,
 * а не только в рецептах, затем избранные. `total` — сколько подходящих сетов всего.
 */
export function suggestSets(
  sets: MealSet[],
  products: string[],
  recipes: Map<string, Recipe>,
  isFavorite: (setId: string) => boolean,
  limit = 3,
  offset = 0,
): { items: Suggestion[]; total: number } {
  if (!products.length) return { items: [], total: 0 };
  const ranked = sets
    .map((set) => ({ set, products: matched(setKeys(set, recipes), products) }))
    .filter((s) => s.products.length)
    .map((s) => ({ ...s, auto: autoPicks(s.set, s.products, recipes) }))
    .sort(
      (a, b) =>
        b.products.length - a.products.length ||
        b.auto.score - a.auto.score ||
        Number(isFavorite(b.set.id)) - Number(isFavorite(a.set.id)) ||
        a.set.name.localeCompare(b.set.name, 'ru', { numeric: true }),
    );
  // «что ещё нужно» считаем только для показанных сетов
  const items = ranked.slice(offset, offset + limit).map(({ set, products: found, auto }) => {
    const choice = { setId: set.id, picks: auto.picks };
    return { set, products: found, choice, missing: missingProducts(set, choice, products, recipes) };
  });
  return { items, total: ranked.length };
}
