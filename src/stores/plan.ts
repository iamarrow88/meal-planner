import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { addDays, range, today } from '@/lib/dates';
import { db, markDeleted, save, type SyncMeta } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { DayPlan, Meal, MealChoice } from '@/lib/types';

/** Выбранный период (общий для меню и списка покупок) и дни меню в нём. */
export const usePlanStore = defineStore('plan', () => {
  const start = ref(today());
  const length = ref<1 | 7>(7);

  const dates = computed(() => range(start.value, length.value));
  const end = computed(() => addDays(start.value, length.value - 1));

  const rows = useLiveQuery<((DayPlan & SyncMeta) | undefined)[]>(
    () => db.days.bulkGet(dates.value),
    [],
    () => dates.value.join(),
  );

  const days = computed(() =>
    dates.value.map((date, i): DayPlan => {
      const day = rows.value[i];
      return day && !day.deleted && day.date === date ? day : { date, meals: {} };
    }),
  );

  function shift(dir: number) {
    start.value = addDays(start.value, dir * length.value);
  }

  async function setMeal(day: DayPlan, meal: Meal, choice: MealChoice | undefined) {
    const next: DayPlan = { date: day.date, meals: { ...day.meals } };
    if (choice) next.meals[meal] = choice;
    else delete next.meals[meal];
    await save('days', [JSON.parse(JSON.stringify(next))]); // IndexedDB не принимает reactive-прокси
  }

  const clearDay = (date: string) => markDeleted('days', [date]);

  async function getDay(date: string): Promise<DayPlan> {
    const day = await db.days.get(date);
    return day && !day.deleted ? day : { date, meals: {} };
  }

  /** Для дат вне открытого периода: остальные приёмы пищи этого дня сохраняются. */
  async function addToDate(date: string, meal: Meal, choice: MealChoice) {
    await setMeal(await getDay(date), meal, choice);
  }

  function showDate(date: string) {
    if (!dates.value.includes(date)) start.value = date;
  }

  return { start, length, dates, end, days, shift, setMeal, clearDay, getDay, addToDate, showDate };
});
