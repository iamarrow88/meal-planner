import { portionGrams } from './leftovers';
import { normalizeUnit } from './parse';
import type { MealSet, Recipe } from './types';

/** Размер порции рецепта, как он дан в сете: «В1 Каша с добавкой — 50 г». */
export interface PortionSource {
  setId: string;
  setName: string;
  grams: number;
}

/** Сколько граммов рецепта дают в каждом сете, где он встречается (без повторов, в порядке сетов). */
export function portionSources(recipe: Recipe, sets: MealSet[]): PortionSource[] {
  const result: PortionSource[] = [];
  const seen = new Set<string>();
  for (const set of sets) {
    for (const group of set.groups) {
      for (const option of group.options) {
        if (option.recipe !== recipe.id) continue;
        const grams = portionGrams(option, recipe);
        if (!grams) continue;
        const key = `${set.id}|${grams}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ setId: set.id, setName: set.name, grams });
      }
    }
  }
  return result;
}

/** Сколько порций на эти граммы — до половинок; если что-то нужно, не меньше половины порции. */
export function portionCount(grams: number, portion: number): number {
  if (grams <= 0 || portion <= 0) return 0;
  return Math.max(0.5, Math.round((grams / portion) * 2) / 2);
}

const SIGNS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 };

/** г и мл — до целых, кг и л — до сотых, штуки и ложки — до половинок. */
function round(value: number, unit: string): number {
  if (unit === 'г' || unit === 'мл') return Math.max(1, Math.round(value));
  if (unit === 'кг' || unit === 'л') return Math.max(0.01, Math.round(value * 100) / 100);
  return Math.max(0.5, Math.round(value * 2) / 2);
}

const format = (n: number) => String(Number(n.toFixed(2))).replace('.', ',');

/** Количество с единицей, округлённое как при пересчёте рецепта: 150,4 г → «150 г». */
export const formatQuantity = (value: number, unit: string) =>
  [format(round(value, normalizeUnit(unit))), unit].filter(Boolean).join(' ');

// число (в том числе «1/2», «0,5», «1½») и, через возможный диапазон «-3», единица после него
const NUMBER = /(?<![\d.,/])(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d*\s*[½¼¾⅓⅔])(?![\d.,/]|\s*%)(?=((?:\s*[-–]\s*[\d.,]+)?\s*([а-яёa-z]+\.?(?:\s*л\.)?))?)/gi;

function toNumber(s: string): number {
  const sign = s.match(/[½¼¾⅓⅔]/);
  if (sign) return (Number(s.replace(sign[0], '').trim()) || 0) + SIGNS[sign[0]];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s.replace(',', '.'));
}

/** «2 шт (100 гр)» × 0,5 → «1 шт (50 гр)»; «щепотка» и «по вкусу» не пересчитываются. */
export function scaleQuantity(text: string, factor: number): string {
  if (factor === 1 || /щепот|по вкусу/i.test(text)) return text;
  return text.replace(NUMBER, (num: string, _tail: string | undefined, unit: string | undefined) =>
    format(round(toNumber(num) * factor, normalizeUnit(unit ?? ''))),
  );
}

const ITEM = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(.+?)(\s*(?:—|–|:|\s-\s)\s*)([^\r]+)(\r?)$/;

/** Пересчитывает количества в разделе «## Ингредиенты»; остальной текст рецепта не меняется. */
export function scaleIngredientsSection(body: string, factor: number): string {
  if (factor === 1) return body;
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s*\**\s*ин?гредиент/i.test(l.trim()));
  if (start < 0) return body;
  for (let i = start + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i].trim()); i++) {
    const m = lines[i].match(ITEM);
    if (m) lines[i] = m[1] + m[2] + m[3] + scaleQuantity(m[4], factor) + m[5];
  }
  return lines.join('\n');
}
