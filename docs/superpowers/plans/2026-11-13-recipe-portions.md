# Пересчёт рецепта на порции — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** на странице рецепта выбрать размер порции (из сетов или вручную) и число порций — раздел «Ингредиенты» пересчитывается.

**Architecture:** чистые функции в `src/lib/portions.ts` (источники порций из сетов, пересчёт текста строк ингредиентов), UI в `src/views/RecipeView.vue`. Пересчитывается сам markdown раздела «Ингредиенты» до рендера, поэтому пометки вида «(100 гр)» и «200 гр + 120 гр» масштабируются тоже.

**Tech Stack:** Vue 3, TypeScript, Pinia; тесты — vitest (новая dev-зависимость, `npm test`).

**Spec:** `docs/superpowers/specs/2026-11-13-recipe-portions-design.md`

## Global Constraints
- Файлы рецептов и список покупок не меняются; выбор порций не сохраняется.
- г и мл — до целых (не меньше 1), кг и л — до 0,01, остальные единицы — до 0,5 (не меньше 0,5). Дробная часть через запятую: «1,5».
- «щепотка», «по вкусу» и строки без числа не меняются.

## Review Focus
- Рецепт без «Веса готового блюда»: выбор граммов скрыт, счётчик = кратность всего рецепта, видно предупреждение.
- Рецепт не встречается ни в одном сете: поле граммов пустое по умолчанию → по умолчанию весь рецепт как одна порция (порция = вес блюда).
- Один рецепт дважды в одном сете с одинаковым весом — один пункт в выборе, не два.
- Диапазон «2-3 шт» масштабируется обоими числами.
- Числа в названии продукта («Молоко 2,5%», «Яйца (C1)») не масштабируются — только после разделителя «—/–/:/ - ».

---

### Task 1: `src/lib/portions.ts` + тесты

**Files:** Create `src/lib/portions.ts`, `src/lib/portions.test.ts`; Modify `package.json` (devDependency `vitest`, script `"test": "vitest run"`).

**Interfaces — Produces:**
- `interface PortionSource { setId: string; setName: string; grams: number }`
- `portionSources(recipe: Recipe, sets: MealSet[]): PortionSource[]` — по всем вариантам с `option.recipe === recipe.id`: `portion` в г → `portion.amount`; `fraction` → `yieldGrams × fraction`; ни того ни другого → `yieldGrams`. Без `yieldGrams` граммы через долю не считаются (вариант с `portion` в г всё равно попадает). Дубли (setId+grams) убираются, порядок — как в `sets`.
- `scaleQuantity(text: string, factor: number): string` — масштабирует каждое число, за которым не идёт «%», в тексте количества; не трогает «щепотк*», «по вкусу».
- `scaleIngredientsSection(body: string, factor: number): string` — в разделе `## Ингредиенты` (до следующего заголовка) каждую строку списка `- Имя — количество` переписывает через `scaleQuantity` для части после разделителя; factor === 1 → body без изменений.

- [ ] **Step 1: тесты**
  - `scaleQuantity('200 гр', 0.5) === '100 гр'`; `('2 шт (100 гр)', 0.5) === '1 шт (50 гр)'`; `('2 шт', 0.125) === '0,5 шт'`; `('1 щепотка', 3) === '1 щепотка'`; `('200 гр + 120 гр для начинки', 0.5) === '100 гр + 60 гр для начинки'`; `('2-3 шт', 2) === '4-6 шт'`; `('1/2 стакана', 2) === '1 стакана'`; `('0,5 кг', 3) === '1,5 кг'`.
  - `scaleIngredientsSection` на примере кекса с factor 0.5: «Яблоко — 100 гр», «Яйца — 1 шт (50 гр)», «Соль — 1 щепотка», раздел «Как готовить» не изменился; «Молоко 2,5% — 100 мл» → имя не тронуто.
  - `portionSources`: кекс (400 г) в сете В1 с `portion {50,'г'}` → `[{setId, setName:'В1…', grams:50}]`; вариант с `fraction 0.5` → 200; без yield и с fraction → пусто; дубль в одном сете → один.
- [ ] **Step 2:** `npm test` → FAIL (нет модуля).
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npm test` → PASS; `npx vue-tsc -b` без ошибок.
- [ ] **Step 5:** commit.

### Task 2: UI в `RecipeView.vue`

**Consumes:** `portionSources`, `scaleIngredientsSection`; `useSetsStore()` (список сетов).

- Показ только если `recipe.ingredients.length`.
- Есть `yieldGrams`: select «Порция» из `portionSources` + вариант «своя»; input граммов (по умолчанию первый источник, иначе `yieldGrams`); счётчик «− N +» (мин. 1, по умолчанию `round(yield/grams)`, не меньше 1); подпись «весь рецепт — X порций» (X до 0,5). factor = N × grams / yieldGrams.
- Нет `yieldGrams`: только счётчик «× N» (по умолчанию 1), factor = N, предупреждение «нет «Вес готового блюда» — пересчитывается весь рецепт».
- `html` рендерит `scaleIngredientsSection(recipe.body, factor)`.
- [ ] **Step 1:** реализовать; `npx vue-tsc -b` без ошибок.
- [ ] **Step 2:** проверить в браузере на `examples/menu` (импорт папки): кекс, В1 — 50 г → 8 порций; 4 порции → Яблоко 100 гр.
- [ ] **Step 3:** README: абзац в разделе «Рецепт»; commit.
