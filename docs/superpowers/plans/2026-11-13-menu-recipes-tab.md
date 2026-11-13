# «В меню» Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A default «В меню» tab on the Recipes page. It lists the recipes needed from tomorrow to a chosen day and not yet cooked, expanded and scaled, with a summary of shared ingredients.

**Architecture:** Pure functions in a new `src/lib/cooking.ts` (list of recipes to cook, shared-ingredient summary) with vitest tests. `CookPanel` gets `from`/`until` props. A new `MenuRecipes.vue` component holds the tab. `RecipesView.vue` switches tabs via `?tab=all`.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Tailwind 4 utility classes, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-menu-recipes-tab-design.md`

## Global Constraints
- UI text in Russian, using existing classes `card`, `chip`, `chip-on`, `btn-primary`, `btn-secondary`, `hint`, `link`, `text-warn`, `text-accent`.
- No new data kinds, no Dexie version, no sync changes.
- Range starts tomorrow (`addDays(today(), 1)`); today is not included. Day chips: 7 days from tomorrow, from all menu days (not the open week in «Меню»); default end: tomorrow + 3 (4 days); not persisted.
- «В меню» is the default tab; `/recipes?tab=all` is «Все рецепты».
- Rounding of scaled amounts follows `scaleQuantity` rules (г/мл whole, кг/л 0.01, others 0.5).

## Review Focus
- The same recipe appears in two meals on the same day: one card, «нужно к» lists both meals.
- Recipe with a partially covered need: it stays in the list, and the counters show only the missing part.
- A recipe without «Вес готового блюда» chosen in the menu: shown with the «Рецептов» multiplier, never in «Уже приготовлено».

---

### Task 1: `cookList` — which recipes to cook

**Files:**
- Create: `src/lib/cooking.ts`
- Test: `src/lib/cooking.test.ts`

**Interfaces:**
- Consumes: `Need`, `Coverage`, `needId` from `src/lib/leftovers.ts`; `selectedOptions` from `src/lib/shopping.ts`; `MEALS`, `DayPlan`, `MealSet`, `Meal` from types.
- Produces:
  ```ts
  export interface CookItem { recipeId: string; when: { date: string; meal: Meal }[]; weighable: boolean }
  export function cookList(args: {
    days: DayPlan[]; sets: Map<string, MealSet>; needs: Need[];
    coverage: (n: Need) => Coverage | undefined; from: string; until: string;
  }): { todo: CookItem[]; cooked: string[] }
  ```
  `todo` is ordered by the first `when` (date, then MEALS order). `when` is deduped by date+meal. `cooked` holds the recipe ids that have needs in range, all of them covered or closed, and none missing; they keep that same order.

- [ ] **Step 1: Write the failing tests** in `cooking.test.ts`. Reuse the fixtures style of `leftovers.test.ts` (recipe `soup` yield 1000, set `lunch1` 300 g portion; add a recipe `cake` without `yieldGrams` and a breakfast set offering it). Tests:
  - `'только дни в диапазоне и непокрытое'`: soup lunch on 14, 15, 20; range 14–15, no coverage → `todo` = `[{recipeId:'soup', when:[{date:'2026-11-14',meal:'lunch'},{date:'2026-11-15',meal:'lunch'}], weighable:true}]`.
  - `'покрытое остатками уходит в cooked'`: coverage returns `{covered:300,missing:0,closed:false,eaten:0}` for all needs → `todo` `[]`, `cooked` `['soup']`.
  - `'частично покрытое остаётся'`: missing 100 → soup in `todo`.
  - `'закрытое «Съедено» не считается нужным'`: closed for all → `cooked` `['soup']`.
  - `'без веса — из выбранных вариантов, всегда в todo'`: cake at breakfast 14 → `{recipeId:'cake', weighable:false, when:[{date:'2026-11-14',meal:'breakfast'}]}`, and it comes before soup lunch on 14.
- [ ] **Step 2:** `npx vitest run src/lib/cooking.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `cookList`.** Needs with `from <= date <= until`: a need is open when `!c || (!c.closed && c.missing > 0)`. The recipe goes to `todo` if any need is open, else to `cooked`. Then walk `days` in range × MEALS × `selectedOptions(group, choice)`. Every option whose `recipe` has no need in range at all (not weighable) adds to `todo` with `weighable:false`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `Cooking: list of recipes to cook up to a day`.

### Task 2: `sharedIngredients` — summary

**Files:**
- Modify: `src/lib/cooking.ts`
- Test: `src/lib/cooking.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `Ingredient`; `productBase`, `displayName` from shopping.ts; `scaleQuantity` from portions.ts (for rounding: format via `scaleQuantity(\`${amount} ${unit}\`, 1)`, or extract its rounding into an exported `roundAmount(n, unit)`; choose the latter if `scaleQuantity` can't be reused cleanly).
- Produces:
  ```ts
  export interface SharedLine { name: string; total: string; parts: { recipeId: string; title: string; amount: string }[] }
  export function sharedIngredients(items: { recipe: Recipe; factor: number }[]): SharedLine[]
  ```
  Only products found in ≥2 different recipes, matched by `productBase(name)`. `total` sums amounts per unit, and different units are joined with « + ». Amounts that are null («по вкусу») give an empty `amount` and add nothing to the total, and if nothing has an amount the `total` is `''`. Lines are sorted by name.

- [ ] **Step 1: Tests:**
  - `'яйца из двух рецептов: сумма и разбивка'`: cake {Яйца 2 шт}×1, salad {Яйцо 3 шт}×1 → `[{name:'Яйца', total:'5 шт', parts:[{title:'Кекс',amount:'2 шт'},{title:'Салат',amount:'3 шт'}]}]` (`toMatchObject`). If `productBase` doesn't merge «Яйца»/«Яйцо», use the same word in both and note it.
  - `'множитель и разные единицы'`: A {Лук 100 г}×1.5, B {Лук 1 шт}×1 → total `'150 г + 1 шт'`.
  - `'продукт из одного рецепта не показывается'` → `[]`.
  - `'по вкусу'`: A {Соль null}, B {Соль null} → total `''`, parts amounts `''`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` → all PASS.
- [ ] **Step 5:** Commit `Cooking: shared ingredients summary`.

### Task 3: `CookPanel` limited to a day

**Files:**
- Modify: `src/components/CookPanel.vue:15,36-38`

**Interfaces:**
- Produces: props `from?: string`, `until?: string` (ISO dates). With them, `inMenu` = needs of this recipe with `from <= date <= until`. Without them, behaviour stays as today (`plan.dates`, from today).

- [ ] **Step 1:** Add the prop and the filter. `RecipeView` keeps passing nothing.
- [ ] **Step 2:** `npx vue-tsc -b` → no errors.
- [ ] **Step 3:** Commit `CookPanel: optional until day`.

### Task 4: `MenuRecipes.vue` and the tabs

**Files:**
- Create: `src/components/MenuRecipes.vue`
- Modify: `src/views/RecipesView.vue`, `README.md` (a bullet on «В меню»)

**Interfaces:**
- Consumes: `cookList`, `sharedIngredients`, `CookItem` (Tasks 1–2); `CookPanel` with `from`/`until` and `v-model:factor` (Task 3); `scaleIngredientsSection`; `usePlanStore().days/dates`, `useLeftoversStore().needs/coverageOf`, `useSetsStore().byId`, `useRecipesStore().byId`; `formatDay`, `addDays`, `today`.

- [ ] **Step 1: RecipesView tabs.** Two chips at the top: «В меню» (`route.query.tab !== 'all'`) and «Все рецепты». Switch with `router.replace({ query: tab === 'all' ? { tab: 'all' } : {} })`. The existing list moves under «Все рецепты» unchanged.
- [ ] **Step 2: MenuRecipes.**
  - Chips: `range(tomorrow, 7)` over `leftovers.days`, labelled `formatDay(d).replace(/,.*$/, '')`. `until` defaults to `chips[min(3, len-1)]`.
  - Data: `cookList({ days: plan.days, ... from: tomorrow, until })`.
  - `factors = ref<Record<string, number>>({})` fed by each CookPanel's `v-model:factor`. For non-weighable items, also fed by CookPanel (its «Рецептов» path).
  - Summary card «Общее для нескольких рецептов», hidden when empty: `name — total: title amount, …`.
  - Per item, a `card`. The header button toggles collapse (`collapsed` Set) and shows the title (`RouterLink` to the recipe) and «нужно к: пт обед, сб ужин» using `MEAL_LABELS` lowercased. The body has `CookPanel :recipe :from :until v-model:factor` and `marked.parse(scaleIngredientsSection(body, factor))` in `.markdown`.
  - Footer hint: «Уже приготовлено к этим дням:» with links for `cooked`.
  - Empty states: `todo` empty and `cooked` non-empty → «К этим дням всё приготовлено». Both empty, or no chips → «В меню на эти дни нет рецептов». Both cases get a link to `?tab=all`.
- [ ] **Step 3:** `npx vue-tsc -b`, `npm test`, `npx vite build` → clean.
- [ ] **Step 4: Browser check** (preview): «В меню» opens by default. The default is 4 days. Changing the chip changes the list. «Приготовлено» moves a recipe to «Уже приготовлено». The summary follows the counters. «назад» from a recipe opened under «Все рецепты» returns to that tab. Check mobile width too. Restore the DB snapshot afterwards.
- [ ] **Step 5:** Commit `Recipes: «В меню» tab with cooking up to a day and shared ingredients`.
