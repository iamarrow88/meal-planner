import { describe, expect, it } from 'vitest';
import { buildShoppingList } from './shopping';
import type { DayPlan, MealSet, Recipe } from './types';

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
const set: MealSet = {
  id: 'lunch1',
  name: 'Обед 1',
  meal: 'lunch',
  source: 'Обед 1.md',
  groups: [
    {
      id: 'g',
      title: 'Суп',
      pick: 1,
      common: [],
      options: [{ id: 'soup', label: 'Суп', items: [{ name: 'Сметана', amount: 20, unit: 'г' }], recipe: 'soup', portion: { amount: 200, unit: 'г' } }],
    },
  ],
};
const sets = new Map([[set.id, set]]);
const recipes = new Map([[recipe.id, recipe]]);
const amountOf = (lines: { name: string; amount: number | null }[], name: string) => lines.find((l) => l.name === name)?.amount;

describe('buildShoppingList', () => {
  it('число дня — для приёмов пищи без своего числа', () => {
    const days: DayPlan[] = [
      { date: '2026-11-14', people: 2, meals: { lunch: { setId: 'lunch1', picks: { g: ['soup'] } } } },
      { date: '2026-11-15', people: 2, meals: { lunch: { setId: 'lunch1', picks: { g: ['soup'] }, people: 5 } } },
    ];
    expect(amountOf(buildShoppingList(days, sets, recipes, 1).lines, 'Сметана')).toBe(140); // 20 × 2 + 20 × 5
  });

  it('персоны приёма пищи важнее числа по умолчанию', () => {
    const days: DayPlan[] = [{ date: '2026-11-14', meals: { lunch: { setId: 'lunch1', picks: { g: ['soup'] }, people: 3 } } }];
    const { lines } = buildShoppingList(days, sets, recipes, 1);
    expect(amountOf(lines, 'Картофель')).toBeCloseTo(300); // 500 × 200/1000 × 3
    expect(amountOf(lines, 'Сметана')).toBe(60);
  });

  it('покрытое остатками не покупается, продукты сверх рецепта — покупаются', () => {
    const days: DayPlan[] = [{ date: '2026-11-14', meals: { lunch: { setId: 'lunch1', picks: { g: ['soup'] } } } }];
    const covered = (date: string, meal: string, groupId: string, optionId: string) =>
      date === '2026-11-14' && meal === 'lunch' && groupId === 'g' && optionId === 'soup' ? 0.75 : 0;
    const { lines } = buildShoppingList(days, sets, recipes, 2, covered);
    expect(amountOf(lines, 'Картофель')).toBeCloseTo(50); // 500 × 0,2 × 2 × 0,25
    expect(amountOf(lines, 'Сметана')).toBe(40);
  });
});
