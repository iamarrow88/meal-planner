import yaml from 'js-yaml';
import { MEALS, type Ingredient, type Meal, type Recipe } from './types';

const MEAL_ALIASES: Record<string, Meal> = {
  завтрак: 'breakfast',
  завтраки: 'breakfast',
  обед: 'lunch',
  обеды: 'lunch',
  ужин: 'dinner',
  ужины: 'dinner',
  перекус: 'snack',
  перекусы: 'snack',
  полдник: 'snack',
};

export function normalizeMeal(value: unknown): Meal | null {
  const v = String(value ?? '').trim().toLowerCase();
  if ((MEALS as readonly string[]).includes(v)) return v as Meal;
  return MEAL_ALIASES[v] ?? null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** «Шоколадные маффины (~40 минут)» → название и время. */
export function splitTitle(fileName: string): { title: string; time?: string } {
  const name = fileName.replace(/\.md$/i, '').trim();
  const m = name.match(/^(.*?)\s*\(~\s*([^)]*)\)\s*$/);
  return m ? { title: m[1].trim(), time: m[2].trim() } : { title: name };
}

export function normalizeUnit(unit: string): string {
  const u = unit.trim().replace(/[,;\s]+$/, '').toLowerCase();
  if (/^(г|гр|грамм\S*)\.?$/.test(u)) return 'г';
  if (/^(кг|килограмм\S*)\.?$/.test(u)) return 'кг';
  if (/^стакан\S*$/.test(u)) return 'стакан';
  if (/^мл\.?$/.test(u)) return 'мл';
  if (/^л\.?$/.test(u)) return 'л';
  if (/^шт(\.|ук\S*)?$/.test(u)) return 'шт';
  if (/^(ст|стол)\.?\s*л\.?$|^(ст\.?|столов\S+) ложк\S*$/.test(u)) return 'ст. л.';
  if (/^ч\.?\s*л\.?$|^чайн\S+ ложк\S*$/.test(u)) return 'ч. л.';
  if (/^зуб(ч|чик\S*)?\.?$/.test(u)) return 'зубчик';
  return u;
}

export function parseAmount(s: string): number | null {
  const t = s.trim().replace(',', '.');
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n : null;
}

const AMOUNT = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?`;

const FRACTIONS: Record<string, string> = { '½': '.5', '¼': '.25', '¾': '.75', '⅓': '.33', '⅔': '.67' };
const expandFractions = (s: string) =>
  s.replace(/(\d*)\s*([½¼¾⅓⅔])/g, (_, whole: string, f: string) => `${whole || '0'}${FRACTIONS[f]}`);

/** «Яйца — 2 шт (100 гр)», «Сыр: 50 г», «Мука - 1/2 стакана», «Соль — по вкусу», «Ванилин» */
export function parseIngredientLine(line: string): Ingredient {
  const text = line.replace(/^\s*[-*+]\s*(\[[ xX]\]\s*)?/, '').trim();
  const split = text.match(/^(.+?)\s*(?:—|–|:|\s-\s)\s*(.+)$/);
  const name = (split ? split[1] : text).trim();
  const rest = expandFractions(split ? split[2] : '');
  // диапазон «2-3 шт» не складывается, оставляем его текстом
  const m = rest.match(new RegExp(`^(${AMOUNT})(?!\\s*[-–]\\s*\\d|[.,]?\\d)\\s*(.*)$`));
  if (m) {
    const unit = normalizeUnit(m[2].replace(/[(+,].*$/, ''));
    // «200 гр + 120 гр для начинки» — всего 320 г; другая единица не складывается
    const extra = m[2].match(new RegExp(`\\+\\s*(${AMOUNT})\\s*([а-яё]+\\.?(?:\\s*л\\.)?)?`, 'i'));
    const more = extra && (!extra[2] || normalizeUnit(extra[2]) === unit) ? (parseAmount(extra[1]) ?? 0) : 0;
    return { name, amount: parseAmount(m[1])! + more, unit };
  }
  return { name, amount: null, unit: '', note: rest.trim() || undefined };
}

/** Ищет раздел «## Ингредиенты» и разбирает его список. */
function ingredientsFromBody(body: string): Ingredient[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s*\**\s*ин?гредиент/i.test(l.trim()));
  if (start < 0) return [];
  const result: Ingredient[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (/^\s*[-*+]\s+/.test(line)) result.push(parseIngredientLine(line));
  }
  return result;
}

export function splitFrontmatter(markdown: string): { meta: Record<string, unknown>; body: string } {
  const text = markdown.replace(/^﻿/, '');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/);
  if (!fm) return { meta: {}, body: text.trim() };
  try {
    return { meta: (yaml.load(fm[1]) as Record<string, unknown>) ?? {}, body: fm[2].trim() };
  } catch {
    return { meta: {}, body: fm[2].trim() }; // сломанные параметры не мешают прочитать сам рецепт
  }
}

/** Разделы шаблона заметки, в приложении они не нужны. */
function dropServiceSections(body: string): string {
  const out: string[] = [];
  let skip = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) skip = /^#{1,6}\s*\**\s*(оценка|кжбу)/i.test(line);
    if (!skip) out.push(line);
  }
  return out.join('\n').trim();
}

export function parseRecipe(markdown: string, fileName: string): Recipe {
  const { meta, body } = splitFrontmatter(markdown);
  const { title, time } = splitTitle(fileName);

  const tags = Array.isArray(meta.tags)
    ? meta.tags.map(String)
    : typeof meta.tags === 'string'
      ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
  const meals = [...new Set(tags.map(normalizeMeal).filter((m): m is Meal => !!m))];
  const weight = body.match(/вес готового блюда[^\d\n]*(\d+(?:[.,]\d+)?)\s*(кг|г)/i);

  return {
    id: slugify(fileName),
    title,
    meals,
    time,
    yieldGrams: weight ? parseAmount(weight[1])! * (weight[2].toLowerCase() === 'кг' ? 1000 : 1) : undefined,
    tags,
    ingredients: ingredientsFromBody(body),
    body: dropServiceSections(body).replace(/\[\[([^\]|#]+)[^\]]*\]\]/g, '$1'),
    source: fileName,
  };
}
