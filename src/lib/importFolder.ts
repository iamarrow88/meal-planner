import { db, markDeleted, save, stripMeta, type Kind } from './db';
import { normalizeMeal, parseRecipe } from './parse';
import { parseSet } from './parseSet';
import type { Meal, MealSet, Recipe } from './types';

export interface ImportCounts {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}

export interface ImportReport {
  recipes: ImportCounts;
  sets: ImportCounts;
  skipped: number;
  warnings: { file: string; text: string }[];
}

/** Куда относится файл: по названию папки в пути. «Мои меню по дням» и прочее пропускаются. */
function classify(path: string): 'recipe' | Meal | null {
  for (const folder of path.split(/[\\/]/).slice(0, -1)) {
    if (folder.trim().toLowerCase() === 'рецепты') return 'recipe';
    const meal = normalizeMeal(folder);
    if (meal) return meal;
  }
  return null;
}

/** Порядок ключей не важен: после синхронизации он может быть другим. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

async function diff<T extends object>(kind: Kind, key: keyof T, incoming: T[]) {
  const existing = (await db.table(kind).toArray()) as (T & { deleted?: boolean })[];
  const live = new Map(existing.filter((r) => !r.deleted).map((r) => [r[key] as string, r]));
  const counts: ImportCounts = { added: 0, updated: 0, unchanged: 0, removed: 0 };
  const changed: T[] = [];
  for (const item of incoming) {
    const old = live.get(item[key] as string);
    live.delete(item[key] as string);
    if (!old) counts.added++;
    else if (stable(stripMeta(old)) === stable(item)) {
      counts.unchanged++;
      continue;
    } else counts.updated++;
    changed.push(item);
  }
  counts.removed = live.size;
  return { changed, gone: [...live.keys()], counts };
}

/**
 * Загружает папку с заметками: Obsidian — основной источник, поэтому сет или рецепт,
 * файла которого больше нет, удаляется и из приложения.
 */
export async function importFolder(files: Iterable<File>): Promise<ImportReport> {
  const warnings: ImportReport['warnings'] = [];
  const recipes: Recipe[] = [];
  const sets: MealSet[] = [];
  let skipped = 0;

  for (const file of files) {
    if (!/\.md$/i.test(file.name)) continue;
    const kind = classify(file.webkitRelativePath || file.name);
    if (!kind) {
      skipped++;
      continue;
    }
    const text = await file.text();
    if (kind === 'recipe') recipes.push(parseRecipe(text, file.name));
    else {
      const parsed = parseSet(text, file.name, kind);
      sets.push(parsed.set);
      warnings.push(...parsed.warnings.map((w) => ({ file: file.name, text: w })));
    }
  }

  if (!recipes.length || !sets.length) {
    throw new Error('В этой папке не нашлось подпапок «Рецепты» и «Завтраки», «Обеды», «Ужины» или «Перекусы». Ничего не изменено.');
  }

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const noted = new Set<string>();
  for (const set of sets) {
    for (const group of set.groups) {
      for (const option of group.options) {
        if (!option.recipe) continue;
        const recipe = byId.get(option.recipe);
        if (!recipe) {
          warnings.push({ file: set.source, text: `не найден рецепт для «${option.label}»` });
          option.recipe = undefined;
          option.portion = undefined;
          option.fraction = undefined;
          option.items = [{ name: option.label, amount: null, unit: '' }];
          continue;
        }
        if (noted.has(recipe.id)) continue;
        if (!recipe.ingredients.length) {
          noted.add(recipe.id);
          warnings.push({ file: recipe.source, text: 'нет раздела с ингредиентами — рецепт не попадёт в покупки' });
        } else if (option.portion && !recipe.yieldGrams) {
          noted.add(recipe.id);
          warnings.push({ file: recipe.source, text: 'нет «Вес готового блюда» — в покупки войдёт весь рецепт, а не порция' });
        }
      }
    }
  }

  const r = await diff<Recipe>('recipes', 'id', recipes);
  const s = await diff<MealSet>('sets', 'id', sets);
  if (r.changed.length) await save('recipes', r.changed);
  if (s.changed.length) await save('sets', s.changed);
  if (r.gone.length) await markDeleted('recipes', r.gone);
  if (s.gone.length) await markDeleted('sets', s.gone);

  return { recipes: r.counts, sets: s.counts, skipped, warnings };
}
