# Остатки приготовленного — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** учёт приготовленных блюд: готовка из рецепта, остатки на Главной, автоматическое покрытие меню, «Съедено», персоны у приёма пищи, покупки без покрытого.

**Architecture:** вся арифметика — чистые функции `src/lib/leftovers.ts` (потребности меню → распределение партий); Pinia-стор `leftovers` держит партии и **все** дни меню (live query) и отдаёт результат распределения экранам; персоны по умолчанию — синхронизируемая запись `settings`.

**Tech Stack:** Vue 3, TS, Pinia, Dexie, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-leftovers-design.md`

## Global Constraints
- Единица учёта — граммы. Подсветка «пора доесть» — партии старше 3 дней.
- Порядок приёмов пищи — `MEALS` (завтрак, обед, ужин, перекус); партии — старшие первыми.
- Счётчики рецепта — только открытый период меню (`usePlanStore().dates`), даты ≥ сегодня.
- Новые виды данных `leftovers`, `settings` — без изменения `supabase/schema.sql`.

## Review Focus
- Отмеченное «Съедено» закрывает потребность: она больше не занимает граммы, даже если съели меньше.
- Партия, приготовленная позже даты приёма пищи, его не покрывает.
- `fresh` с датой D: партии с `cookedAt < D` не покрывают, `≥ D` — покрывают.
- Остаток партии не уходит ниже 0 при «Съедено»/списании больше остатка.
- Группа `halves` с двумя вариантами — потребность каждого вдвое меньше.

---

### Task 1: `src/lib/leftovers.ts` + тесты
**Types (в `types.ts`):** `Leftover { id; recipeId; cookedAt; grams; adjust; eaten: EatenRecord[] }`, `EatenRecord { date; meal: Meal; grams }`, `Settings { id: 'main'; people: number }`; `MealChoice` + `people?: number`, `fresh?: Record<string, string>`.
**Produces:**
- `optionKey(groupId, optionId): string` → `'g:o'`.
- `portionGrams(option: SetOption, recipe: Recipe): number | null` (правило `portionSources`; `portionSources` переиспользует её).
- `interface Need { date; meal; setId; groupId; optionId; recipeId; portionGrams; people; grams; freshSince?: string }`
- `mealNeeds(days: DayPlan[], sets: Map<string, MealSet>, recipes: Map<string, Recipe>, defaultPeople: number): Need[]` — по дате и `MEALS`.
- `needId(n: Need): string` → `'date|meal|g:o'`.
- `interface Coverage { eaten: number; covered: number; missing: number; closed: boolean }`
- `interface BatchState { batch: Leftover; left: number; reserved: number; free: number }`
- `distribute(batches: Leftover[], needs: Need[]): { batches: BatchState[]; coverage: Map<string, Coverage> }`
- `eatenOf(batches, need): number` — сумма записей с той же датой, приёмом пищи и рецептом.
- `splitEaten(batches: BatchState[], need: Need, grams: number): { batchId: string; grams: number }[]` — старшие первыми, не больше `left`, только `cookedAt ≤ need.date`.

Тесты: покрытие по порядку дат; нехватка → `missing`; партия позже даты не покрывает; `fresh`; съеденное закрывает потребность и уменьшает `left`; `adjust` (+ и −); halves ×0,5; people ×N; `splitEaten` по двум партиям.

### Task 2: хранение и синхронизация
`db.ts`: `KINDS` + `leftovers`, `settings`; Dexie `version(8)`; перегрузки `save`; `Backup`/`exportAll`/`importAll`; `sync.ts` — таблицы в транзакции `pull`. Сторы: `src/stores/settings.ts` (`people`, `setPeople(n)`, миграция из `localStorage['people']`), `src/stores/leftovers.ts` (партии, все дни, `needs`, `state = distribute(...)`, `cook(recipeId, grams)`, `discard(id, grams)`, `weigh(id, gramsLeft)`, `eat(need, grams)`, `uneat(need)`, `coverageOf(need)`). `menus.apply` убирает `fresh`. `plan.setMeal` — при смене сета `people` сохраняется (делает `MealSlot`).

### Task 3: страница рецепта
Таблица счётчиков (по `portionSources` + «своя, г»), по умолчанию из непокрытых потребностей открытого периода с датами; итог в г и рецептах; `scaleIngredientsSection(body, total / yield)`; «Приготовлено» → `cook`, сообщение. Без веса — прежний множитель рецепта, кнопка недоступна.

### Task 4: Главная — «🍲 Уже приготовлено»
`src/components/LeftoversCard.vue`: партии с `left > 0`; «осталось / в меню / ≈ порции сетов / N дней назад», подсветка > 3 дней; «Списать» (всё или г), «Взвесила: осталось N г».

### Task 5: меню
`PlannerView`: «На сколько человек» по умолчанию; `MealSlot` (+ проп `date`): персоны приёма пищи; под группой у варианта с рецептом — статус покрытия, «готовлю заново»/«брать из приготовленного», «Съедено» (г, по умолчанию покрытая часть) / «снять отметку»; прошедший день без отметки — «Отметить съеденным?»; подсказка «Уже приготовлено» под невыбранным приёмом пищи.

### Task 6: покупки
`buildShoppingList(days, sets, recipes, people, covered?: (need: Need) => number)` — персоны из `choice.people ?? people`; доля рецепта × (1 − покрытая доля); поле «Сколько человек» = настройка по умолчанию. Тест на покрытие.

### Task 7: проверка в браузере, README, коммиты
