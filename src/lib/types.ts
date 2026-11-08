export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

export interface Ingredient {
  name: string;
  amount: number | null; // null — «по вкусу» и т.п.
  unit: string;
  note?: string;
}

export interface Recipe {
  id: string; // по имени файла, так на него ссылаются сеты через [[...]]
  title: string;
  meals: Meal[];
  time?: string; // «40 минут» из имени файла
  yieldGrams?: number; // «Вес готового блюда»
  tags: string[];
  ingredients: Ingredient[];
  body: string; // markdown без блока параметров
  source: string; // имя файла
}

export interface PortionAmount {
  amount: number;
  unit: string;
}

export interface SetOption {
  id: string;
  label: string; // как написано в файле
  items: Ingredient[]; // продукты варианта
  recipe?: string; // id рецепта, если вариант — ссылка [[...]]
  portion?: PortionAmount; // сколько взять от рецепта по весу
  fraction?: number; // или какую долю («половина порции»); если нет ни того ни другого — весь рецепт
}

export interface SetGroup {
  id: string;
  title: string;
  /** 0 — выбирать не нужно, вариант входит в сет всегда. */
  pick: 0 | 1 | 2;
  /** «один вариант или по половине от двух»: при двух выбранных каждый идёт в половинном количестве. */
  halves?: boolean;
  common: Ingredient[]; // входит при любом выборе: «Каша на молоке 180 мл»
  options: SetOption[];
  note?: string;
}

export interface MealSet {
  id: string;
  name: string;
  meal: Meal;
  groups: SetGroup[];
  note?: string;
  source: string; // имя файла
}

export interface MealChoice {
  setId: string;
  picks: Record<string, string[]>; // id группы → id выбранных вариантов
}

export interface Favorite {
  id: string; // id сета
}

/**
 * Сохранённое меню на день или неделю, чтобы подставить его на другие даты.
 * Дни хранятся по порядку, без дат: первый день меню ложится на выбранную дату.
 */
export interface SavedMenu {
  id: string;
  name: string;
  days: Partial<Record<Meal, MealChoice>>[];
  createdAt: number;
}

/** Оценка сета или рецепта от 1 до 5; id — «set:<id сета>» или «recipe:<id рецепта>». */
export interface Rating {
  id: string;
  stars: number;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  meals: Partial<Record<Meal, MealChoice>>;
}
