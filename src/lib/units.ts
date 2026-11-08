/**
 * Пересчёт единиц, чтобы один продукт не дробился в списке покупок:
 * «Молоко 0,5 л» и «молоко 200 мл» — одна строка «Молоко 700 мл».
 * Вес сводится к граммам, объём — к миллилитрам. Ложки и стаканы — объём, а не вес:
 * без плотности продукта их нельзя перевести в граммы, поэтому «мука 1 ст. л.» и «мука 100 г» останутся двумя строками.
 */
const UNITS: Record<string, { base: 'г' | 'мл'; ratio: number }> = {
  мг: { base: 'г', ratio: 0.001 },
  г: { base: 'г', ratio: 1 },
  кг: { base: 'г', ratio: 1000 },
  мл: { base: 'мл', ratio: 1 },
  л: { base: 'мл', ratio: 1000 },
  'ч. л.': { base: 'мл', ratio: 5 },
  'ст. л.': { base: 'мл', ratio: 15 }, // 1 ст. л. = 3 ч. л.
  стакан: { base: 'мл', ratio: 250 },
};

const SPOONS = new Set(['ч. л.', 'ст. л.']);

/** К какой единице приводится: «кг» → «г», «ст. л.» → «мл»; штуки, зубчики и т.п. не пересчитываются. */
export const baseUnit = (unit: string) => UNITS[unit]?.base ?? unit;

/** Количество в базовой единице: 1,5 кг → 1500. */
export const toBase = (amount: number, unit: string) => amount * (UNITS[unit]?.ratio ?? 1);

/**
 * Как показать сумму. Если продукт везде указан в одной единице, она и остаётся («2 ст. л.»);
 * смешанные ложки — в чайных; иначе граммы или миллилитры, от 1000 — кг или л.
 */
export function presentAmount(base: number, units: Set<string>): { amount: number; unit: string } {
  const list = [...units];
  if (list.length === 1) return { amount: base / (UNITS[list[0]]?.ratio ?? 1), unit: list[0] };
  if (list.every((u) => SPOONS.has(u))) return { amount: base / UNITS['ч. л.'].ratio, unit: 'ч. л.' };
  const unit = baseUnit(list[0]);
  if (unit === 'г' && base >= 1000) return { amount: base / 1000, unit: 'кг' };
  if (unit === 'мл' && base >= 1000) return { amount: base / 1000, unit: 'л' };
  return { amount: base, unit };
}

/**
 * Примерный вес продукта в граммах за единицу — чтобы свести «Яйцо 2 шт» и «Яйцо 100 г»,
 * «Мёд 2 ч. л.» и «Мёд 30 г». Для ложек достаточно указать чайную: столовая — втрое больше,
 * миллилитры и стаканы считаются через неё же. `show` — в чём показать сумму (по умолчанию г или кг);
 * для жидкостей «мл» показывает объём. Продукт ищется по названию без пометок и окончаний.
 */
export interface Weights {
  [unit: string]: number | string | undefined;
  show?: string;
}

export const WEIGHTS: Record<string, Weights> = {
  яйцо: { шт: 50, show: 'шт' },
  картофель: { шт: 150 },
  'лук репчатый': { шт: 100 },
  морковь: { шт: 100 },
  свекла: { шт: 250 },
  помидор: { шт: 120 },
  чеснок: { зубчик: 5, show: 'зубчик' },
  лаваш: { лист: 80 },
  хлебец: { шт: 10, show: 'шт' },
  'лимонный сок': { шт: 40, мл: 1, show: 'мл' }, // сок одного лимона
  'масло растительное': { мл: 0.92, show: 'мл' }, // 1 ст. л. ≈ 14 г
  масло: { мл: 0.92 },
  мёд: { 'ч. л.': 10 },
  'какао-порошок': { 'ч. л.': 5 },
  рис: { 'ч. л.': 8 },
  'томатная паста': { 'ч. л.': 10 },
  сливки: { мл: 1, show: 'мл' },
  кефир: { мл: 1, show: 'мл' },
  'крепкий кофе': { мл: 1, show: 'мл' },
};

/** Сколько граммов в единице: г и кг — всегда, объём — через вес ложки или миллилитра, остальное — по таблице. */
export function gramsPer(unit: string, w: Weights): number | null {
  const own = w[unit];
  if (typeof own === 'number') return own;
  const u = UNITS[unit];
  if (u?.base === 'г') return u.ratio;
  if (u?.base === 'мл') {
    const perMl =
      typeof w.мл === 'number' ? w.мл : typeof w['ч. л.'] === 'number' ? w['ч. л.'] / 5 : typeof w['ст. л.'] === 'number' ? w['ст. л.'] / 15 : null;
    return perMl == null ? null : perMl * u.ratio;
  }
  return null;
}

/** Сумма в граммах — в той единице, в которой продукт удобнее покупать. */
export function presentGrams(grams: number, w: Weights): { amount: number; unit: string } {
  const show = w.show ?? 'г';
  if (show === 'г') return grams >= 1000 ? { amount: grams / 1000, unit: 'кг' } : { amount: grams, unit: 'г' };
  const amount = grams / (gramsPer(show, w) ?? 1);
  if (show === 'мл' && amount >= 1000) return { amount: amount / 1000, unit: 'л' };
  return { amount, unit: show };
}
