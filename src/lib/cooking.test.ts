import { describe, expect, it } from 'vitest';
import { cookList } from './cooking';
import { mealNeeds, type Coverage, type Need } from './leftovers';
import type { DayPlan, MealSet, Recipe, SetOption } from './types';

const soup: Recipe = {
  id: 'soup',
  title: 'Суп',
  meals: ['lunch'],
  yieldGrams: 1000,
  tags: [],
  ingredients: [],
  body: '',
  source: 'Суп.md',
};
const cake: Recipe = { ...soup, id: 'cake', title: 'Кекс', meals: ['breakfast'], yieldGrams: undefined, source: 'Кекс.md' };
const recipes = new Map([soup, cake].map((r) => [r.id, r]));

const opt = (id: string, o: Partial<SetOption> = {}): SetOption => ({ id, label: id, items: [], ...o });
const lunch: MealSet = {
  id: 'lunch1',
  name: 'Обед 1',
  meal: 'lunch',
  source: 'Обед 1.md',
  groups: [{ id: 'g', title: 'Суп', pick: 1, common: [], options: [opt('soup', { recipe: 'soup', portion: { amount: 300, unit: 'г' } })] }],
};
const breakfast: MealSet = {
  id: 'b1',
  name: 'Завтрак 1',
  meal: 'breakfast',
  source: 'Завтрак 1.md',
  groups: [{ id: 'k', title: 'Выпечка', pick: 1, common: [], options: [opt('cake', { recipe: 'cake' })] }],
};
const sets = new Map([lunch, breakfast].map((s) => [s.id, s]));

const soupLunch = { setId: 'lunch1', picks: { g: ['soup'] } };
const day = (date: string, meals: DayPlan['meals']): DayPlan => ({ date, meals });

function list(days: DayPlan[], coverage: (n: Need) => Coverage | undefined = () => undefined, until = '2026-11-15') {
  const needs = mealNeeds(days, sets, recipes, 1);
  return cookList({ days, sets, needs, coverage, from: '2026-11-14', until });
}

const cov = (missing: number, closed = false): Coverage => ({ eaten: closed ? 300 : 0, covered: 300 - missing, missing, closed });

describe('cookList', () => {
  const week = [day('2026-11-13', { lunch: soupLunch }), day('2026-11-14', { lunch: soupLunch }), day('2026-11-15', { lunch: soupLunch }), day('2026-11-20', { lunch: soupLunch })];

  it('только дни в диапазоне и непокрытое', () => {
    expect(list(week).todo).toEqual([
      {
        recipeId: 'soup',
        weighable: true,
        when: [
          { date: '2026-11-14', meal: 'lunch' },
          { date: '2026-11-15', meal: 'lunch' },
        ],
      },
    ]);
  });

  it('покрытое остатками уходит в cooked', () => {
    expect(list(week, () => cov(0))).toEqual({ todo: [], cooked: ['soup'] });
  });

  it('частично покрытое остаётся', () => {
    expect(list(week, () => cov(100)).todo.map((i) => i.recipeId)).toEqual(['soup']);
  });

  it('закрытое «Съедено» не считается нужным', () => {
    expect(list(week, () => cov(0, true))).toEqual({ todo: [], cooked: ['soup'] });
  });

  it('без веса — из выбранных вариантов, всегда в todo и раньше обеда того же дня', () => {
    const days = [day('2026-11-14', { lunch: soupLunch, breakfast: { setId: 'b1', picks: { k: ['cake'] } } })];
    expect(list(days).todo).toEqual([
      { recipeId: 'cake', weighable: false, when: [{ date: '2026-11-14', meal: 'breakfast' }] },
      { recipeId: 'soup', weighable: true, when: [{ date: '2026-11-14', meal: 'lunch' }] },
    ]);
  });

  it('одно блюдо в два приёма пищи — одна запись', () => {
    const days = [day('2026-11-14', { lunch: soupLunch, dinner: { setId: 'lunch1', picks: { g: ['soup'] } } })];
    expect(list(days).todo).toEqual([
      {
        recipeId: 'soup',
        weighable: true,
        when: [
          { date: '2026-11-14', meal: 'lunch' },
          { date: '2026-11-14', meal: 'dinner' },
        ],
      },
    ]);
  });
});
