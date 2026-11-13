import { describe, expect, it } from 'vitest';
import { parseRecipe } from './parse';
import { portionSources, scaleIngredientsSection, scaleQuantity } from './portions';
import type { MealSet, SetOption } from './types';

describe('scaleQuantity', () => {
  it.each([
    ['200 гр', 0.5, '100 гр'],
    ['2 шт (100 гр)', 0.5, '1 шт (50 гр)'],
    ['2 шт', 0.125, '0,5 шт'],
    ['1 щепотка', 3, '1 щепотка'],
    ['по вкусу', 3, 'по вкусу'],
    ['200 гр + 120 гр для начинки', 0.5, '100 гр + 60 гр для начинки'],
    ['2-3 шт', 2, '4-6 шт'],
    ['1/2 стакана', 2, '1 стакана'],
    ['0,5 кг', 3, '1,5 кг'],
    ['10 гр', 0.01, '1 гр'],
    ['1 ст. л.', 1.5, '1,5 ст. л.'],
    ['сметана 10% 20 гр', 2, 'сметана 10% 40 гр'],
  ])('%s × %s → %s', (text, factor, expected) => {
    expect(scaleQuantity(text, factor)).toBe(expected);
  });
});

const CAKE = `Вес готового блюда: 400 гр
## Ингредиенты
- Яблоко — 200 гр
- Молоко 2,5% — 100 мл
- Яйца (C1) — 2 шт (100 гр)
- Соль — 1 щепотка
- Ванилин

## Как готовить
1. Смешать 2 яйца и выпекать 30 минут.`;

describe('scaleIngredientsSection', () => {
  it('пересчитывает только количества в разделе «Ингредиенты»', () => {
    const out = scaleIngredientsSection(CAKE, 0.5);
    expect(out).toContain('- Яблоко — 100 гр');
    expect(out).toContain('- Молоко 2,5% — 50 мл');
    expect(out).toContain('- Яйца (C1) — 1 шт (50 гр)');
    expect(out).toContain('- Соль — 1 щепотка');
    expect(out).toContain('- Ванилин');
    expect(out).toContain('Вес готового блюда: 400 гр');
    expect(out).toContain('1. Смешать 2 яйца и выпекать 30 минут.');
  });

  it('при множителе 1 возвращает текст как есть', () => {
    expect(scaleIngredientsSection(CAKE, 1)).toBe(CAKE);
  });
});

const recipe = parseRecipe(CAKE, 'Яблочный кекс (~40 минут).md');
const option = (o: Partial<SetOption>): SetOption => ({ id: 'o', label: '', items: [], recipe: recipe.id, ...o });
const set = (id: string, name: string, options: SetOption[]): MealSet => ({
  id,
  name,
  meal: 'breakfast',
  source: `${name}.md`,
  groups: [{ id: 'g', title: '', pick: 1, common: [], options }],
});

describe('portionSources', () => {
  it('берёт вес порции из сета', () => {
    const sets = [set('v1', 'В1 Каша', [option({ portion: { amount: 50, unit: 'г' } })])];
    expect(portionSources(recipe, sets)).toEqual([{ setId: 'v1', setName: 'В1 Каша', grams: 50 }]);
  });

  it('доля порции — от веса готового блюда, без порции — весь рецепт', () => {
    const sets = [set('a', 'A', [option({ fraction: 0.5 })]), set('b', 'B', [option({})])];
    expect(portionSources(recipe, sets).map((s) => s.grams)).toEqual([200, 400]);
  });

  it('без веса готового блюда доли не считаются', () => {
    const noYield = { ...recipe, yieldGrams: undefined };
    const sets = [set('a', 'A', [option({ fraction: 0.5 }), option({ id: 'p', portion: { amount: 50, unit: 'г' } })])];
    expect(portionSources(noYield, sets)).toEqual([{ setId: 'a', setName: 'A', grams: 50 }]);
  });

  it('убирает повторы и чужие рецепты', () => {
    const p = { amount: 50, unit: 'г' };
    const sets = [set('a', 'A', [option({ portion: p }), option({ id: 'x', portion: p }), option({ id: 'y', recipe: 'other', portion: p })])];
    expect(portionSources(recipe, sets)).toHaveLength(1);
  });
});
