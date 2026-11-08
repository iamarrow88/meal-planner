import { categorize, type Category } from './categories';
import { baseUnit, gramsPer, presentAmount, presentGrams, toBase, WEIGHTS, type Weights } from './units';
import type { DayPlan, Ingredient, MealChoice, MealSet, Recipe, SetGroup, SetOption } from './types';

export interface ShoppingLine {
  key: string;
  name: string;
  category: Category;
  unit: string;
  amount: number | null;
  notes: string[];
  dishes: Dish[];
  /** Для строки «Специи и приправы»: что в неё вошло. */
  items?: string[];
}

/** Откуда продукт: сет или рецепт (на рецепт можно перейти). */
export interface Dish {
  title: string;
  recipe?: string;
}

export const formatAmount = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function describeLine(l: ShoppingLine) {
  if (l.items) return '';
  return l.amount != null ? `${formatAmount(l.amount)} ${l.unit}`.trim() : l.notes.join(', ');
}

/** Название строки целиком, как для копирования: «Молоко (1,5%/2,5%)», «Специи и приправы: соль, перец». */
export function lineTitle(l: ShoppingLine) {
  return l.items ? `${l.name}: ${l.items.join(', ')}` : l.name;
}

/** Без лишних пробелов и знаков в конце: «Соль,» и «перец.» из заметок. */
const tidy = (name: string) => name.replace(/\s+/g, ' ').replace(/(\d)\s+%/g, '$1%').replace(/[\s.,;:]+$/, '').trim();

/** По этому ключу продукты складываются: «Мука», «мука» и «мёд»/«мед» — один продукт. */
const productKey = (name: string) => tidy(name).toLowerCase().replace(/ё/g, 'е');

/** Слова названия без скобок и в алфавитном порядке: «Гречка (отварная)» = «отварная гречка». */
const wordsKey = (name: string) => productKey(name.replace(/[()]/g, ' ')).split(' ').sort().join(' ');

/** Слово без окончания: «яйца» и «яйцо», «помидоры» и «помидор», «куриное» и «куриный» совпадают. */
export const stem = (word: string) => (word.length > 3 ? word.replace(/[аеиоуыэюяйь]+$/, '') : word);

/** Строка списка покупок: слова без окончаний, так «Яйцо 2 шт» и «Яйца 1 шт» складываются. */
const lineKey = (base: string) => wordsKey(base).split(' ').map(stem).sort().join(' ');

/** Примерные веса продуктов (units.ts) по ключу строки. */
const WEIGHT_BY_KEY = new Map(Object.entries(WEIGHTS).map(([name, w]) => [lineKey(name), w]));

/** Их не покупают: вода, бульон и уже готовые крупы, которые в рецептах указаны в отварном виде. */
const NOT_BOUGHT = new Set(
  [
    'вода',
    'вода (кипяток)',
    'вода (теплая)',
    'вода (для тушения)',
    'бульон',
    'бульон (или вода)',
    'гречка отварная',
    'рис отварной',
    'пшенная каша',
    'пшеничная каша',
    'кукурузная каша',
  ].map(wordsKey),
);

export const isNotBought = (name: string) => NOT_BOUGHT.has(wordsKey(name));

/** Специи и приправы идут одной строкой без количества. */
const SPICES = new Set(
  [
    'соль',
    'специи',
    'специи для рыбы',
    'разрыхлитель',
    'ванилин',
    'зелень',
    'перец',
    'перец молотый',
    'перец черный',
    'перец черный молотый',
    'приправа для бульона, соль, сушеные овощи',
    'бульонный кубик',
    'приправа для курицы',
    'сухой чеснок',
    'чеснок сушеный',
    'итальянская приправа для пиццы',
  ].map(wordsKey),
);

/** Заглавная только первая буква; остальное как в заметке, чтобы не портить «(C1)» или «Hochland». */
export const displayName = (name: string) => {
  const s = tidy(name);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Пометки продукта — текст в скобках и жирность: «Молоко 2,5%» → «молоко» + «2,5%».
 * По основе одинаковые продукты собираются в одну строку: «Молоко (1,5%/2,5%)».
 */
/** Пометки, которые делают продукт другим, а не вариантом того же: консервы, заморозка и т.п. остаются в названии. */
const OTHER_PRODUCT = /собственном соку|консерв|заморож|маринован|солен|копчен|вялен/i;

export function splitMarks(name: string): { base: string; marks: string[] } {
  const marks: string[] = [];
  const base = tidy(name)
    .replace(/\s*\(([^()]*)\)?/g, (whole: string, m: string) =>
      // «(можно заменить на тунец в собственном соку)», «(запеченная или копченая)» — подсказка, а не другой продукт
      OTHER_PRODUCT.test(m) && !/(^|\s)(или|можно)\s/i.test(m) ? whole : (marks.push(tidy(m)), ' '),
    )
    .replace(/\s*\d+(?:[.,]\d+)?%/g, (m) => (marks.push(m.trim()), ' '));
  return { base: tidy(base), marks: marks.filter(Boolean) };
}

/** К специям относятся продукты из списка и всё, что в заметке помечено «(специи)». */
/** Продукт без пометок как набор слов: «Творог 5% (брикет)» → «творог». Так его ищут при подборе сетов. */
export const productBase = (name: string) => wordsKey(splitMarks(name).base);

export const isSpice = (name: string) => spiceNames(name) != null;

/** Специи и то, что не покупают, при подборе сетов по продуктам не предлагаются. */
export const isPantryStaple = (name: string) => isNotBought(name) || isSpice(name);

function spiceNames(name: string): string[] | null {
  const { base, marks } = splitMarks(name);
  if (SPICES.has(wordsKey(name)) || SPICES.has(wordsKey(base))) return [base];
  if (/^специи$/i.test(base)) return [tidy(name)]; // «Специи (кориандр)»
  if (marks.some((m) => /^специи$/i.test(m))) return [base]; // «Зира (специи)»
  // «Соль, перец» — несколько специй в одной строке
  const parts = base.split(',').map(tidy).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => SPICES.has(wordsKey(p)))) return parts;
  return null;
}

const byNumber = (a: string, b: string) => a.localeCompare(b, 'ru', { numeric: true });

/** Жирность по возрастанию («0%/0,1%/5%»), за ней остальные пометки. */
const percent = (m: string) => (/^\d+(?:[.,]\d+)?%$/.test(m) ? parseFloat(m.replace(',', '.')) : Infinity);
const byMark = (a: string, b: string) => percent(a) - percent(b) || byNumber(a, b);

/** «Молоко (1,5%/2,5%)»; если в пометках свои запятые или косые, разделяем точкой с запятой. */
const joinMarks = (marks: string[]) => marks.sort(byMark).join(marks.some((m) => /,\s|\//.test(m)) ? '; ' : '/');

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

  const marks = new Map<string, string[]>(); // ключ строки → пометки всех вариантов продукта
  const units = new Map<string, Set<string>>(); // ключ строки → в каких единицах продукт встретился
  const spices = new Map<string, string>(); // ключ → как показать

  const addDish = (line: ShoppingLine, dish: Dish) => {
    if (!line.dishes.some((d) => d.title === dish.title)) line.dishes.push(dish);
  };

  const add = (ing: Ingredient, factor: number, dish: Dish) => {
    if (isNotBought(ing.name)) return;

    const spice = spiceNames(ing.name);
    if (spice) {
      const key = 'специи|';
      const line = map.get(key) ?? {
        key,
        name: 'Специи и приправы',
        category: 'Специи и приправы',
        unit: '',
        amount: null,
        notes: [],
        dishes: [],
        items: [],
      };
      for (const s of spice) if (!spices.has(wordsKey(s))) spices.set(wordsKey(s), displayName(s).toLowerCase());
      addDish(line, dish);
      map.set(key, line);
      return;
    }

    const { base, marks: own } = splitMarks(ing.name);
    // кг и г, л, мл и ложки складываются в одну строку: в ключе — единица, к которой они приводятся
    const key = `${lineKey(base)}|${ing.amount == null ? '' : baseUnit(ing.unit)}`;
    const line = map.get(key) ?? {
      key,
      name: displayName(base),
      category: categorize(tidy(ing.name)),
      unit: ing.unit,
      amount: null,
      notes: [],
      dishes: [],
    };
    const known = marks.get(key) ?? [];
    for (const m of own) if (!known.some((k) => productKey(k) === productKey(m))) known.push(m);
    marks.set(key, known);
    if (ing.amount != null) {
      // пока считаем в граммах или миллилитрах; в чём показать — решаем в конце
      line.amount = (line.amount ?? 0) + toBase(ing.amount * factor, ing.unit);
      units.set(key, (units.get(key) ?? new Set()).add(ing.unit));
    } else if (ing.note && !line.notes.includes(ing.note)) line.notes.push(ing.note);
    addDish(line, dish);
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

  mergeByWeight(map, marks, units);

  for (const line of map.values()) {
    const used = units.get(line.key);
    if (line.amount != null && used) Object.assign(line, presentAmount(line.amount, used));
    const m = marks.get(line.key);
    if (m?.length) line.name += ` (${joinMarks(m)})`;
    if (line.items) line.items = [...spices.values()].sort(byNumber);
  }

  return {
    lines: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    noIngredients: [...noIngredients],
    wholeRecipe: [...wholeRecipe],
  };
}

/**
 * Один продукт в граммах, штуках и ложках — одна строка, если для него известен примерный вес:
 * «Яйцо 2 шт» и «Яйцо 100 г» → «Яйцо 4 шт». Строки, которые не пересчитать, остаются как были.
 */
function mergeByWeight(map: Map<string, ShoppingLine>, marks: Map<string, string[]>, units: Map<string, Set<string>>) {
  const groups = new Map<string, { w: Weights; lines: { line: ShoppingLine; grams: number }[] }>();
  for (const line of map.values()) {
    if (line.amount == null || line.items) continue;
    const sep = line.key.lastIndexOf('|');
    const product = line.key.slice(0, sep);
    const w = WEIGHT_BY_KEY.get(product);
    const per = w && gramsPer(line.key.slice(sep + 1), w);
    if (!w || per == null) continue;
    const g = groups.get(product) ?? { w, lines: [] };
    g.lines.push({ line, grams: line.amount * per });
    groups.set(product, g);
  }
  for (const [product, { w, lines }] of groups) {
    if (lines.length < 2) continue;
    // ключ не зависит от того, какая из строк встретилась первой, — отметка «куплено» не прыгает
    const key = `${product}|≈`;
    const merged: ShoppingLine = { ...lines[0].line, key, notes: [], dishes: [] };
    Object.assign(merged, presentGrams(lines.reduce((sum, l) => sum + l.grams, 0), w));
    const allMarks: string[] = [];
    for (const { line } of lines) {
      for (const d of line.dishes) if (!merged.dishes.some((x) => x.title === d.title)) merged.dishes.push(d);
      for (const m of marks.get(line.key) ?? []) if (!allMarks.some((k) => productKey(k) === productKey(m))) allMarks.push(m);
      map.delete(line.key);
    }
    marks.set(key, allMarks);
    units.delete(key); // сумма уже в нужной единице
    map.set(key, merged);
  }
}
