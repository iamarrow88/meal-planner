<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatDay, today } from '@/lib/dates';
import { portionCount, portionSources } from '@/lib/portions';
import type { Recipe } from '@/lib/types';
import { useLeftoversStore } from '@/stores/leftovers';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';

/**
 * Сколько готовить: счётчик у каждого размера порции из сетов и своя порция в граммах.
 * По умолчанию счётчики заполняются из меню открытого периода (или дней from–until) — тем, что ещё не покрыто остатками.
 * factor — во сколько раз умножить ингредиенты рецепта.
 */
const props = defineProps<{
  recipe: Recipe;
  /** Считать меню только в этих днях (ISO); без них — открытый период от сегодня. */
  from?: string;
  until?: string;
  /** Считать как без веса: в сетах порция не в граммах — только множитель рецепта, без записи в приготовленное. */
  noWeight?: boolean;
}>();
const factor = defineModel<number>('factor', { default: 1 });
const emit = defineEmits<{ cooked: [grams: number] }>();

const sets = useSetsStore();
const plan = usePlanStore();
const leftovers = useLeftoversStore();

const fmt = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');
const fmtExact = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const shortDay = (iso: string) => formatDay(iso).replace(/,.*$/, '');

interface Row {
  key: string;
  label: string;
  grams: number;
  count: number; // по умолчанию — из меню
  dates: string[];
}

const yieldGrams = computed(() => (props.noWeight ? undefined : props.recipe.yieldGrams));

/** Блюдо в меню открытого периода, от сегодня (или в днях from–until). */
const inDays = (date: string) =>
  props.from || props.until
    ? date >= (props.from ?? today()) && (!props.until || date <= props.until)
    : date >= today() && plan.dates.includes(date);
const inMenu = computed(() => leftovers.needs.filter((n) => n.recipeId === props.recipe.id && inDays(n.date)));
/** Из них ещё не покрыто остатками. */
const planned = computed(() =>
  inMenu.value.filter((n) => {
    const c = leftovers.coverageOf(n);
    return !!c && !c.closed && c.missing > 0;
  }),
);

const rows = computed<Row[]>(() => {
  const list: Row[] = portionSources(props.recipe, sets.sets).map((s) => ({
    key: `${s.setId}|${s.grams}`,
    label: s.setName,
    grams: s.grams,
    count: 0,
    dates: [],
  }));
  for (const n of planned.value) {
    const key = `${n.setId}|${n.portionGrams}`;
    let row = list.find((r) => r.key === key);
    if (!row) {
      row = { key, label: sets.byId.get(n.setId)?.name ?? 'Сет', grams: n.portionGrams, count: 0, dates: [] };
      list.push(row);
    }
    row.count += leftovers.coverageOf(n)!.missing; // пока в граммах
    if (!row.dates.includes(n.date)) row.dates.push(n.date);
  }
  for (const r of list) r.count = portionCount(r.count, r.grams);
  // блюда нет в меню — как раньше: весь рецепт в порциях первого сета; если есть, но всё покрыто, — 0
  if (!inMenu.value.length && list[0] && yieldGrams.value)
    list[0].count = Math.max(1, Math.round(yieldGrams.value / list[0].grams));
  return list;
});

const counts = ref<Record<string, number>>({});
const customGrams = ref<number | null>(null);
const customCount = ref(0);
const recipeCount = ref(1); // без веса готового блюда — сколько рецептов
const done = ref('');

// новые данные меню или другой рецепт — снова значения по умолчанию
watch(
  () => `${props.recipe.id}|${rows.value.map((r) => `${r.key}=${r.count}`).join()}`,
  () => {
    counts.value = Object.fromEntries(rows.value.map((r) => [r.key, r.count]));
    customCount.value = 0;
    if (!rows.value.length && yieldGrams.value) {
      customGrams.value = yieldGrams.value;
      customCount.value = 1;
    }
  },
  { immediate: true },
);

const total = computed(
  () =>
    rows.value.reduce((s, r) => s + (counts.value[r.key] ?? 0) * r.grams, 0) +
    (customGrams.value ?? 0) * customCount.value,
);

watch(
  [total, recipeCount, yieldGrams],
  // пока ничего не набрано — ингредиенты как в заметке
  () => (factor.value = yieldGrams.value ? (total.value > 0 ? total.value / yieldGrams.value : 1) : recipeCount.value),
  { immediate: true },
);

const step = (key: string, d: number) => {
  counts.value = { ...counts.value, [key]: Math.max(0, (counts.value[key] ?? 0) + d) };
};

async function cook() {
  const grams = Math.round(total.value);
  await leftovers.cook(props.recipe.id, grams);
  done.value = `Записано: ${grams} г. Остатки — на Главной.`;
  emit('cooked', grams);
}
</script>

<template>
  <div class="mt-3 flex flex-col gap-2 rounded-lg border border-line p-2.5">
    <template v-if="yieldGrams">
      <span class="font-medium">Сколько готовить</span>
      <div v-for="r in rows" :key="r.key" class="flex flex-wrap items-center gap-1.5">
        <span class="min-w-0 flex-1">
          {{ r.label }} — {{ fmt(r.grams) }} г
          <span v-if="r.dates.length" class="hint block">в меню: {{ r.dates.map(shortDay).join(', ') }}</span>
        </span>
        <button
          class="btn-secondary px-3 py-1"
          :aria-label="`Меньше: ${r.label}`"
          :disabled="!counts[r.key]"
          @click="step(r.key, -1)"
        >
          −
        </button>
        <span class="min-w-[3ch] text-center text-[17px] font-semibold">{{ fmt(counts[r.key] ?? 0) }}</span>
        <button class="btn-secondary px-3 py-1" :aria-label="`Больше: ${r.label}`" @click="step(r.key, 1)">+</button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <label class="flex min-w-0 flex-1 items-center gap-1">
          своя:
          <input
            :value="customGrams ?? ''"
            type="number"
            min="1"
            inputmode="numeric"
            class="w-[76px]"
            aria-label="Своя порция, г"
            @change="customGrams = Number(($event.target as HTMLInputElement).value) || null"
          />
          г
        </label>
        <button
          class="btn-secondary px-3 py-1"
          aria-label="Меньше своих порций"
          :disabled="!customCount"
          @click="customCount--"
        >
          −
        </button>
        <span class="min-w-[3ch] text-center text-[17px] font-semibold">{{ customCount }}</span>
        <button class="btn-secondary px-3 py-1" aria-label="Больше своих порций" @click="customCount++">+</button>
      </div>
      <p class="hint">
        Итого {{ Math.round(total) }} г — {{ fmtExact(total / yieldGrams) }} рецепта (весь рецепт — {{ yieldGrams }} г)
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn-primary" :disabled="total <= 0" @click="cook">Приготовлено</button>
        <span v-if="done" class="text-[13px] text-accent" aria-live="polite">{{ done }}</span>
      </div>
    </template>
    <template v-else>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="w-[72px] shrink-0 font-medium">Рецептов</span>
        <button class="btn-secondary px-3 py-1" aria-label="Меньше" :disabled="recipeCount <= 1" @click="recipeCount--">
          −
        </button>
        <span class="min-w-[2ch] text-center text-[17px] font-semibold">{{ recipeCount }}</span>
        <button class="btn-secondary px-3 py-1" aria-label="Больше" @click="recipeCount++">+</button>
      </div>
      <p class="text-[13px] text-warn">
        <template v-if="noWeight && recipe.yieldGrams">Порция в сете указана не в граммах</template>
        <template v-else>Нет «Вес готового блюда»</template>
        — пересчитывается весь рецепт, а не порции, и в остатки блюдо записать нельзя.
      </p>
    </template>
  </div>
</template>
