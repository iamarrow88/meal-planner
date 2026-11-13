import { defineStore } from 'pinia';
import { computed } from 'vue';
import { addDays } from '@/lib/dates';
import { db, markDeleted, save } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import { MEALS, type DayPlan, type SavedMenu } from '@/lib/types';
import { useSetsStore } from './sets';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // IndexedDB не принимает reactive-прокси

/** Сколько блюд выбрано в меню: «7 дней · 21 блюдо». */
export const dishCount = (menu: SavedMenu) => menu.days.reduce((n, d) => n + Object.keys(d).length, 0);

/** Сохранённые меню на день или неделю; подставляются на любые даты и дальше правятся как обычно. */
export const useMenusStore = defineStore('menus', () => {
  const rows = useLiveQuery<SavedMenu[]>(() => db.menus.filter((m) => !m.deleted).toArray(), []);
  const menus = computed(() => [...rows.value].sort((a, b) => b.createdAt - a.createdAt));

  const byName = (name: string) => menus.value.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());

  /** Сохраняет дни как меню; меню с тем же названием заменяется. */
  async function saveMenu(name: string, days: DayPlan[]) {
    const old = byName(name);
    const menu: SavedMenu = {
      id: old?.id ?? crypto.randomUUID(),
      name: name.trim(),
      days: plain(days.map((d) => d.meals)),
      createdAt: Date.now(),
    };
    await save('menus', [menu]);
    return menu;
  }

  /**
   * Подставляет меню начиная с даты `start`: дни меню заменяют то, что было запланировано на эти даты.
   * Сеты, которых больше нет (удалены из Obsidian), пропускаются — их число возвращается.
   */
  async function apply(menu: SavedMenu, start: string) {
    const sets = useSetsStore();
    const known = new Set(sets.sets.map((s) => s.id));
    let skipped = 0;
    // число человек относится к дате, а не к блюдам: на этих датах оно остаётся
    const before = await db.days.bulkGet(menu.days.map((_, i) => addDays(start, i)));
    const days: DayPlan[] = menu.days.map((meals, i) => {
      const kept: DayPlan['meals'] = {};
      for (const meal of MEALS) {
        const choice = meals[meal];
        if (!choice) continue;
        // «готовлю заново» относится к тем датам, где отмечено, на новые даты не переносится
        if (known.has(choice.setId)) kept[meal] = { setId: choice.setId, picks: choice.picks, ...(choice.people ? { people: choice.people } : {}) };
        else skipped++;
      }
      const people = before[i] && !before[i]!.deleted ? before[i]!.people : undefined;
      return { date: addDays(start, i), meals: kept, ...(people ? { people } : {}) };
    });
    const filled = days.filter((d) => Object.keys(d.meals).length || d.people);
    const empty = days.filter((d) => !Object.keys(d.meals).length && !d.people).map((d) => d.date);
    if (filled.length) await save('days', plain(filled));
    if (empty.length) await markDeleted('days', empty);
    return { skipped };
  }

  const remove = (menu: SavedMenu) => markDeleted('menus', [menu.id]);

  return { menus, byName, saveMenu, apply, remove };
});
