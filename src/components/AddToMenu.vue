<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, formatDay, today } from '@/lib/dates';
import { useLiveQuery } from '@/lib/live';
import { MEALS, MEAL_LABELS, type DayPlan, type Meal, type MealChoice, type MealSet } from '@/lib/types';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';

/**
 * Кнопка «Добавить в меню»: выбрать день и приём пищи и поставить туда сет.
 * `picks` — уже выбранные варианты (на странице сета); остальное можно выбрать потом в меню.
 */
const props = defineProps<{ set: MealSet; picks?: MealChoice['picks']; small?: boolean }>();

const plan = usePlanStore();
const sets = useSetsStore();

const open = ref(false);
const date = ref(today());
const meal = ref<Meal>(props.set.meal);
const addedTo = ref<{ date: string; meal: Meal }>();

function toggle() {
  open.value = !open.value;
  addedTo.value = undefined;
  meal.value = props.set.meal;
}

// в списке сетов таких кнопок много: день читаем, только когда панель открыта
const day = useLiveQuery<DayPlan | undefined>(
  async () => (open.value ? plan.getDay(date.value) : undefined),
  undefined,
  () => `${open.value}|${date.value}`,
);
const existing = computed(() => {
  const choice = day.value?.date === date.value ? day.value.meals[meal.value] : undefined;
  if (!choice) return undefined;
  if (choice.setId === props.set.id) return 'этот же сет';
  return sets.byId.get(choice.setId)?.name ?? 'сет, которого больше нет';
});

// что ещё не выбрано: в покупки такая группа не попадёт, пока выбор не сделан
const unpicked = computed(() =>
  props.set.groups.filter((g) => {
    if (g.pick === 0) return false;
    const need = g.pick === 2 && !g.halves ? Math.min(2, g.options.length) : 1;
    return (props.picks?.[g.id] ?? []).length < need;
  }),
);

async function add() {
  await plan.addToDate(date.value, meal.value, { setId: props.set.id, picks: JSON.parse(JSON.stringify(props.picks ?? {})) });
  addedTo.value = { date: date.value, meal: meal.value };
  open.value = false;
}

const quick = [
  { label: 'Сегодня', date: () => today() },
  { label: 'Завтра', date: () => addDays(today(), 1) },
];
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      :class="small ? 'link self-start text-[13px]' : 'btn-primary self-start'"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ small ? '＋ В меню' : 'Добавить в меню' }}
    </button>

    <div v-if="open" class="card flex flex-col gap-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="w-[92px] shrink-0 font-medium">День</span>
        <input v-model="date" type="date" class="min-w-0" aria-label="День" />
        <button
          v-for="q in quick"
          :key="q.label"
          class="chip py-1"
          :class="{ 'chip-on': date === q.date() }"
          @click="date = q.date()"
        >
          {{ q.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="w-[92px] shrink-0 font-medium">Приём пищи</span>
        <button v-for="m in MEALS" :key="m" class="chip py-1" :class="{ 'chip-on': meal === m }" @click="meal = m">
          {{ MEAL_LABELS[m] }}
        </button>
      </div>
      <p v-if="meal !== set.meal" class="hint">Это сет для приёма «{{ MEAL_LABELS[set.meal].toLowerCase() }}».</p>
      <p v-if="unpicked.length" class="hint">
        Не выбрано: {{ unpicked.map((g) => g.title).join(', ') }}. Это можно выбрать и позже в меню, но пока выбора нет,
        в список покупок эти блюда не попадут.
      </p>
      <p v-if="existing" class="text-[13px] text-warn">
        На {{ formatDay(date) }} {{ MEAL_LABELS[meal].toLowerCase() }} уже выбран: {{ existing }}. Он будет заменён.
      </p>
      <div class="flex gap-2">
        <button class="btn-primary" :disabled="!date" @click="add">{{ existing ? 'Заменить' : 'Добавить' }}</button>
        <button class="btn-secondary" @click="open = false">Отмена</button>
      </div>
    </div>

    <p v-if="addedTo" class="text-[13px]">
      Добавлено: {{ formatDay(addedTo.date) }}, {{ MEAL_LABELS[addedTo.meal].toLowerCase() }}.
      <RouterLink to="/menu" class="text-accent" @click="plan.showDate(addedTo.date)">Открыть меню ›</RouterLink>
    </p>
  </div>
</template>
