import Dexie, { type EntityTable } from 'dexie';
import type { DayPlan, Favorite, MealSet, Pantry, Rating, Recipe, SavedMenu } from './types';

/** Служебные поля для синхронизации, хранятся рядом с данными. */
export interface SyncMeta {
  updatedAt?: number;
  deleted?: boolean;
  dirty?: 0 | 1; // 1 — изменено локально и ещё не отправлено
}

export const KINDS = ['recipes', 'sets', 'days', 'favorites', 'menus', 'ratings', 'pantry'] as const;
export type Kind = (typeof KINDS)[number];

export const db = new Dexie('meal-planner') as Dexie & {
  recipes: EntityTable<Recipe & SyncMeta, 'id'>;
  sets: EntityTable<MealSet & SyncMeta, 'id'>;
  days: EntityTable<DayPlan & SyncMeta, 'date'>;
  favorites: EntityTable<Favorite & SyncMeta, 'id'>;
  menus: EntityTable<SavedMenu & SyncMeta, 'id'>;
  ratings: EntityTable<Rating & SyncMeta, 'id'>;
  pantry: EntityTable<Pantry & SyncMeta, 'id'>;
};

db.version(1).stores({
  recipes: 'id, meal, title',
  sets: 'id, meal, name',
  days: 'date',
});

db.version(2)
  .stores({
    recipes: 'id, meal, title, dirty',
    sets: 'id, meal, name, dirty',
    days: 'date, dirty',
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    for (const kind of KINDS) {
      await tx.table(kind).toCollection().modify((r) => Object.assign(r, { updatedAt: now, deleted: false, dirty: 1 }));
    }
  });

// Рецепты могут относиться к нескольким приёмам пищи. Сеты теперь приходят из Obsidian, а сеты старого вида
// (основные блюда + допы) новым экранам непонятны: они помечаются удалёнными, сами данные в строке остаются.
db.version(3)
  .stores({})
  .upgrade(async (tx) => {
    const now = Date.now();
    await tx.table('recipes').toCollection().modify((r) => {
      if (Array.isArray(r.meals)) return;
      r.meals = r.meal ? [r.meal] : [];
      r.source ??= r.id;
      delete r.meal;
      Object.assign(r, { updatedAt: now, dirty: 1 });
    });
    await tx.table('sets').toCollection().modify((s) => {
      if (!Array.isArray(s.groups)) Object.assign(s, { deleted: true, updatedAt: now, dirty: 1 });
    });
  });

db.version(4).stores({ favorites: 'id, dirty' });

db.version(5).stores({ menus: 'id, dirty' });

db.version(6).stores({ ratings: 'id, dirty' });

db.version(7).stores({ pantry: 'id, dirty' });

export const primaryKey =(kind: Kind) => (kind === 'days' ? 'date' : 'id');

export function stripMeta<T extends SyncMeta>(row: T): Omit<T, keyof SyncMeta> {
  const { updatedAt: _u, deleted: _d, dirty: _x, ...data } = row;
  return data;
}

let onLocalChange: () => void = () => {};
/** sync.ts подписывается, чтобы отправлять изменения на сервер. */
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn;
}

const fresh = (now: number) => ({ updatedAt: now, deleted: false, dirty: 1 as const });

export async function save(kind: 'recipes', items: Recipe[]): Promise<void>;
export async function save(kind: 'sets', items: MealSet[]): Promise<void>;
export async function save(kind: 'days', items: DayPlan[]): Promise<void>;
export async function save(kind: 'favorites', items: Favorite[]): Promise<void>;
export async function save(kind: 'menus', items: SavedMenu[]): Promise<void>;
export async function save(kind: 'ratings', items: Rating[]): Promise<void>;
export async function save(kind: 'pantry', items: Pantry[]): Promise<void>;
export async function save(kind: Kind, items: object[]) {
  const now = Date.now();
  await db.table(kind).bulkPut(items.map((i) => ({ ...stripMeta(i), ...fresh(now) })));
  onLocalChange();
}

/** Удаление — это пометка deleted, чтобы его увидели другие устройства. */
export async function markDeleted(kind: Kind, keys: string[]) {
  await db
    .table(kind)
    .where(':id')
    .anyOf(keys)
    .modify({ deleted: true, dirty: 1, updatedAt: Date.now() });
  onLocalChange();
}

export interface Backup {
  version: 1;
  exportedAt: string;
  recipes: Recipe[];
  sets: MealSet[];
  days: DayPlan[];
  favorites?: Favorite[]; // в старых копиях его нет
  menus?: SavedMenu[];
  ratings?: Rating[];
  pantry?: Pantry[];
}

async function live<K extends Kind>(kind: K) {
  const rows = await db.table(kind).toArray();
  return rows.filter((r) => !r.deleted).map(stripMeta) as never[];
}

export async function exportAll(): Promise<Backup> {
  const [recipes, sets, days, favorites, menus, ratings, pantry] = await Promise.all([
    live('recipes'),
    live('sets'),
    live('days'),
    live('favorites'),
    live('menus'),
    live('ratings'),
    live('pantry'),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), recipes, sets, days, favorites, menus, ratings, pantry };
}

export async function importAll(data: Backup) {
  const now = Date.now();
  await db.transaction('rw', [db.recipes, db.sets, db.days, db.favorites, db.menus, db.ratings, db.pantry], async () => {
    for (const kind of KINDS) {
      await db.table(kind).toCollection().modify({ deleted: true, dirty: 1, updatedAt: now });
      await db.table(kind).bulkPut((data[kind] ?? []).map((i: object) => ({ ...stripMeta(i), ...fresh(now) })));
    }
  });
  onLocalChange();
}
