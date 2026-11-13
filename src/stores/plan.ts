import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { addDays, range, today } from '@/lib/dates';
import { db, markDeleted, save, type SyncMeta } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { DayPlan, Meal, MealChoice } from '@/lib/types';
import { useSettingsStore } from './settings';

/** Выбранный период (общий для меню и списка покупок) и дни меню в нём. */
const PERIOD_KEY = 'period';

/**
 * Период запоминается между запусками, пока он не закончился: неделя «с завтра» останется
 * неделей с той же даты и завтра. Если последний её день уже прошёл, открывается сегодняшний день.
 */
function loadPeriod(): { start: string; length: 1 | 7 } {
  try {
    const saved = JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null');
    const length = saved?.length === 1 ? 1 : 7;
    const valid = typeof saved?.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.start);
    if (valid && addDays(saved.start, length - 1) >= today()) return { start: saved.start, length };
    return { start: today(), length };
  } catch {
    return { start: today(), length: 7 };
  }
}

export const usePlanStore = defineStore('plan', () => {
  const saved = loadPeriod();
  const start = ref(saved.start);
  const length = ref<1 | 7>(saved.length);

  watch([start, length], () => {
    try {
      localStorage.setItem(PERIOD_KEY, JSON.stringify({ start: start.value, length: length.value }));
    } catch {
      /* хранилище недоступно — период просто не запомнится */
    }
  });

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
    const next: DayPlan = { date: day.date, meals: { ...day.meals }, ...(day.people ? { people: day.people } : {}) };
    if (choice) next.meals[meal] = choice;
    else delete next.meals[meal];
    await save('days', [JSON.parse(JSON.stringify(next))]); // IndexedDB не принимает reactive-прокси
  }

/** Убирает блюда дня; число человек дня остаётся — оно относится к дате, а не к блюдам. */
  async function clearDay(date: string) {
    const day = await getDay(date);
    if (day.people) await save('days', [{ date, meals: {}, people: day.people }]);
    else await markDeleted('days', [date]);
  }

  async function getDay(date: string): Promise<DayPlan> {
    const day = await db.days.get(date);
    return day && !day.deleted ? day : { date, meals: {} };
  }

  /** Для дат вне открытого периода: остальные приёмы пищи этого дня сохраняются. */
  async function addToDate(date: string, meal: Meal, choice: MealChoice) {
    await setMeal(await getDay(date), meal, choice);
  }

/** Число человек на день; совпадает с обычным — своё число дня убирается. */
  async function setDayPeople(date: string, n: number) {
    const settings = useSettingsStore();
    const day = await getDay(date);
    const next: DayPlan = { date, meals: { ...day.meals } };
    const people = Math.round(n);
    if (people > 0 && people !== settings.people) next.people = people;
    if (!next.people && !Object.keys(next.meals).length) await markDeleted('days', [date]);
    else await save('days', [JSON.parse(JSON.stringify(next))]);
  }

  /**
   * Число человек на неделю: становится обычным числом. Дни открытого периода без своего числа получают его сами;
   * день со своим числом (гости) остаётся, а если оно совпало с новым — своё число убирается.
   */
  async function setWeekPeople(n: number) {
    const settings = useSettingsStore();
    const people = Math.max(1, Math.round(n) || 1);
    await settings.setPeople(people);
    const same = days.value.filter((d) => d.people === people);
    for (const d of same) await setDayPeople(d.date, people);
  }

  function showDate(date: string) {
    if (!dates.value.includes(date)) start.value = date;
  }

  return { start, length, dates, end, days, shift, setMeal, clearDay, getDay, addToDate, showDate, setDayPeople, setWeekPeople };
});
