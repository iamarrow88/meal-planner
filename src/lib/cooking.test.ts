import { describe, expect, it } from 'vitest';
import { cookList, openOn, sharedIngredients } from './cooking';
import { mealNeeds, type Coverage, type Need } from './leftovers';
import type { DayPlan, Ingredient, MealSet, Recipe, SetOption } from './types';

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

const r = (id: string, title: string, ingredients: Ingredient[]): Recipe => ({ ...soup, id, title, ingredients });
const ing = (name: string, amount: number | null, unit = ''): Ingredient => ({ name, amount, unit });

describe('sharedIngredients', () => {
  it('яйца из двух рецептов: сумма и разбивка', () => {
    const lines = sharedIngredients([
      { recipe: r('cake', 'Кекс', [ing('Яйца', 2, 'шт'), ing('Мука', 200, 'г')]), factor: 1 },
      { recipe: r('salad', 'Салат', [ing('Яйца', 3, 'шт')]), factor: 1 },
    ]);
    expect(lines).toEqual([
      {
        name: 'Яйца',
        total: '5 шт',
        parts: [
          { recipeId: 'cake', title: 'Кекс', amount: '2 шт' },
          { recipeId: 'salad', title: 'Салат', amount: '3 шт' },
        ],
      },
    ]);
  });

  it('множитель и разные единицы', () => {
    const [line] = sharedIngredients([
      { recipe: r('a', 'А', [ing('Лук', 100, 'г')]), factor: 1.5 },
      { recipe: r('b', 'Б', [ing('Лук', 1, 'шт')]), factor: 1 },
    ]);
    expect(line.total).toBe('150 г + 1 шт');
    expect(line.parts.map((p) => p.amount)).toEqual(['150 г', '1 шт']);
  });

  it('кг и г, л и мл, шт и шт. складываются', () => {
    const lines = sharedIngredients([
      { recipe: r('a', 'А', [ing('Мука', 0.5, 'кг'), ing('Молоко', 1, 'л'), ing('Яйца', 1, 'шт.')]), factor: 1 },
      { recipe: r('b', 'Б', [ing('Мука', 200, 'г'), ing('Молоко', 250, 'мл'), ing('Яйца', 2, 'шт')]), factor: 1 },
    ]);
    expect(Object.fromEntries(lines.map((l) => [l.name, l.total]))).toEqual({ Мука: '700 г', Молоко: '1250 мл', Яйца: '3 шт' });
    expect(lines.find((l) => l.name === 'Мука')!.parts.map((p) => p.amount)).toEqual(['500 г', '200 г']);
  });

  it('продукт из одного рецепта не показывается', () => {
    expect(sharedIngredients([{ recipe: r('a', 'А', [ing('Лук', 100, 'г'), ing('Лук', 50, 'г')]), factor: 1 }])).toEqual([]);
  });

  it('по вкусу', () => {
    const [line] = sharedIngredients([
      { recipe: r('a', 'А', [ing('Сахар', null)]), factor: 1 },
      { recipe: r('b', 'Б', [ing('Сахар', null)]), factor: 2 },
    ]);
    expect(line).toMatchObject({ name: 'Сахар', total: '' });
    expect(line.parts.map((p) => p.amount)).toEqual(['', '']);
  });

  it('соль, вода и специи не показываются', () => {
    expect(
      sharedIngredients([
        { recipe: r('a', 'А', [ing('Соль', 1, 'ч.л.'), ing('Вода', 200, 'мл')]), factor: 1 },
        { recipe: r('b', 'Б', [ing('Соль', null), ing('Вода', 100, 'мл')]), factor: 1 },
      ]),
    ).toEqual([]);
  });
});

describe('openOn', () => {
  it('непокрытые приёмы пищи рецепта в этот день', () => {
    const days = [day('2026-11-13', { lunch: soupLunch, dinner: { setId: 'lunch1', picks: { g: ['soup'] } } }), day('2026-11-14', { lunch: soupLunch })];
    const needs = mealNeeds(days, sets, recipes, 1);
    const coverage = (n: Need) => (n.meal === 'dinner' ? cov(0) : cov(300));
    expect(openOn(needs, coverage, 'soup', '2026-11-13')).toEqual(['lunch']);
    expect(openOn(needs, () => cov(0, true), 'soup', '2026-11-13')).toEqual([]);
  });
});
