import { describe, expect, it } from 'vitest';
import { distribute, freeFor, mealNeeds, needId, splitEaten, type Need } from './leftovers';
import type { DayPlan, Leftover, MealSet, Recipe, SetOption } from './types';

const recipe: Recipe = {
  id: 'soup',
  title: 'Суп',
  meals: ['lunch'],
  yieldGrams: 1000,
  tags: [],
  ingredients: [{ name: 'Картофель', amount: 500, unit: 'г' }],
  body: '',
  source: 'Суп.md',
};
const recipes = new Map([[recipe.id, recipe]]);

const opt = (id: string, o: Partial<SetOption> = {}): SetOption => ({ id, label: id, items: [], ...o });
const lunch: MealSet = {
  id: 'lunch1',
  name: 'Обед 1',
  meal: 'lunch',
  source: 'Обед 1.md',
  groups: [{ id: 'g', title: 'Суп', pick: 1, common: [], options: [opt('soup', { recipe: 'soup', portion: { amount: 300, unit: 'г' } }), opt('other')] }],
};
const halves: MealSet = {
  id: 'dinner1',
  name: 'Ужин 1',
  meal: 'dinner',
  source: 'Ужин 1.md',
  groups: [
    {
      id: 'h',
      title: 'Горячее',
      pick: 2,
      halves: true,
      common: [],
      options: [opt('soup', { recipe: 'soup', portion: { amount: 200, unit: 'г' } }), opt('rice')],
    },
  ],
};
const sets = new Map([lunch, halves].map((s) => [s.id, s]));

const day = (date: string, meals: DayPlan['meals']): DayPlan => ({ date, meals });
const soupLunch = { setId: 'lunch1', picks: { g: ['soup'] } };

const batch = (id: string, cookedAt: string, grams: number, extra: Partial<Leftover> = {}): Leftover => ({
  id,
  recipeId: 'soup',
  cookedAt,
  grams,
  adjust: 0,
  eaten: [],
  ...extra,
});

describe('mealNeeds', () => {
  it('порция × персоны, по датам и приёмам пищи', () => {
    const needs = mealNeeds(
      [
        day('2026-11-15', { lunch: { ...soupLunch, people: 2 } }),
        day('2026-11-14', { dinner: { setId: 'dinner1', picks: { h: ['soup'] } }, lunch: soupLunch }),
      ],
      sets,
      recipes,
      1,
    );
    expect(needs.map((n) => [n.date, n.meal, n.grams])).toEqual([
      ['2026-11-14', 'lunch', 300],
      ['2026-11-14', 'dinner', 200],
      ['2026-11-15', 'lunch', 600],
    ]);
  });

  it('число дня, если у приёма пищи нет своего', () => {
    const [a1, b1] = mealNeeds(
      [{ date: '2026-11-14', people: 2, meals: { lunch: soupLunch, dinner: { setId: 'dinner1', picks: { h: ['soup'] }, people: 4 } } }],
      sets,
      recipes,
      1,
    );
    expect([a1.people, b1.people]).toEqual([2, 4]);
  });

  it('два варианта «по половине» — каждый вдвое меньше; персоны по умолчанию', () => {
    const [n] = mealNeeds([day('2026-11-14', { dinner: { setId: 'dinner1', picks: { h: ['soup', 'rice'] } } })], sets, recipes, 3);
    expect(n.grams).toBe(300); // 200 × 0,5 × 3
  });

  it('без веса порции блюдо не учитывается', () => {
    const noYield = new Map([[recipe.id, { ...recipe, yieldGrams: undefined }]]);
    const set: MealSet = { ...lunch, groups: [{ ...lunch.groups[0], options: [opt('soup', { recipe: 'soup' })] }] };
    expect(mealNeeds([day('2026-11-14', { lunch: soupLunch })], new Map([[set.id, set]]), noYield, 1)).toEqual([]);
  });
});

const needs = (days: DayPlan[]) => mealNeeds(days, sets, recipes, 1);

describe('distribute', () => {
  it('занимает по порядку, недостающее — missing', () => {
    const ns = needs([day('2026-11-14', { lunch: soupLunch }), day('2026-11-15', { lunch: soupLunch })]);
    const { batches, coverage } = distribute([batch('b', '2026-11-13', 500)], ns);
    expect(coverage.get(needId(ns[0]))).toMatchObject({ covered: 300, missing: 0 });
    expect(coverage.get(needId(ns[1]))).toMatchObject({ covered: 200, missing: 100 });
    expect(batches[0]).toMatchObject({ left: 500, reserved: 500, free: 0 });
  });

  it('партия, приготовленная позже, не покрывает более ранний приём пищи', () => {
    const ns = needs([day('2026-11-14', { lunch: soupLunch })]);
    const { coverage } = distribute([batch('b', '2026-11-15', 500)], ns);
    expect(coverage.get(needId(ns[0]))).toMatchObject({ covered: 0, missing: 300 });
  });

  it('«готовлю заново» не берёт из партий, записанных раньше отметки, но берёт из записанной после', () => {
    const mark = '2026-11-14T10:00:00.000Z';
    const ns = needs([day('2026-11-16', { lunch: { ...soupLunch, fresh: { 'g:soup': mark } } })]);
    const before = Date.parse(mark) - 1000;
    const old = distribute([batch('old', '2026-11-14', 500, { createdAt: before })], ns);
    expect(old.coverage.get(needId(ns[0]))!.covered).toBe(0);
    const fresh = distribute(
      [batch('old', '2026-11-14', 500, { createdAt: before }), batch('new', '2026-11-14', 300, { createdAt: before + 5000 })],
      ns,
    );
    expect(fresh.coverage.get(needId(ns[0]))!.covered).toBe(300);
    expect(fresh.batches.find((b) => b.batch.id === 'old')!.reserved).toBe(0);
  });

  it('съеденное закрывает потребность и уменьшает остаток', () => {
    const ns = needs([day('2026-11-14', { lunch: soupLunch }), day('2026-11-15', { lunch: soupLunch })]);
    const b = batch('b', '2026-11-13', 500, { eaten: [{ date: '2026-11-14', meal: 'lunch', grams: 250 }] });
    const { batches, coverage } = distribute([b], ns);
    expect(coverage.get(needId(ns[0]))).toMatchObject({ eaten: 250, closed: true, missing: 0 });
    expect(coverage.get(needId(ns[1]))).toMatchObject({ covered: 250, missing: 50 });
    expect(batches[0]).toMatchObject({ left: 250, reserved: 250, free: 0 });
  });

  it('поправка: списание уменьшает, «оказалось больше» увеличивает; ниже нуля не бывает', () => {
    expect(distribute([batch('b', '2026-11-13', 500, { adjust: 200 })], []).batches[0].left).toBe(300);
    expect(distribute([batch('b', '2026-11-13', 500, { adjust: -100 })], []).batches[0].left).toBe(600);
    expect(distribute([batch('b', '2026-11-13', 500, { adjust: 900 })], []).batches[0].left).toBe(0);
  });

  it('старшие партии первыми', () => {
    const ns = needs([day('2026-11-15', { lunch: soupLunch })]);
    const { batches } = distribute([batch('new', '2026-11-14', 500), batch('old', '2026-11-12', 200)], ns);
    expect(batches.map((b) => [b.batch.id, b.reserved])).toEqual([
      ['old', 200],
      ['new', 100],
    ]);
  });
});

describe('freeFor', () => {
  it('учитывает только партии, приготовленные к этому дню', () => {
    const { batches } = distribute([batch('a', '2026-11-13', 100), batch('b', '2026-11-15', 200)], []);
    expect(freeFor(batches, 'soup', '2026-11-12')).toBe(0);
    expect(freeFor(batches, 'soup', '2026-11-14')).toBe(100);
    expect(freeFor(batches, 'soup', '2026-11-15')).toBe(300);
  });
});

describe('splitEaten', () => {
  it('списывает со старших партий, не больше остатка и только из приготовленных до даты', () => {
    const [n] = needs([day('2026-11-15', { lunch: soupLunch })]) as Need[];
    const { batches } = distribute(
      [batch('a', '2026-11-12', 100), batch('b', '2026-11-13', 500), batch('c', '2026-11-16', 500)],
      [],
    );
    expect(splitEaten(batches, n, 300)).toEqual([
      { batchId: 'a', grams: 100 },
      { batchId: 'b', grams: 200 },
    ]);
    expect(splitEaten(batches, n, 5000).reduce((s, p) => s + p.grams, 0)).toBe(600);
  });
});
