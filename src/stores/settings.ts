import { defineStore } from 'pinia';
import { computed } from 'vue';
import { db, save } from '@/lib/db';
import { useLiveQuery } from '@/lib/live';
import type { Settings } from '@/lib/types';

const ID = 'main';
const LOCAL_PEOPLE = 'people'; // раньше «Сколько человек» хранилось только в списке покупок на устройстве

/** Переносит число персон с устройства в базу один раз, если в базе его ещё нет. */
async function migrateLocal() {
  try {
    const local = Number(JSON.parse(localStorage.getItem(LOCAL_PEOPLE) ?? 'null'));
    if (local > 0 && !(await db.settings.get(ID))) await save('settings', [{ id: ID, people: local }]);
    localStorage.removeItem(LOCAL_PEOPLE);
  } catch {
    /* не прочиталось — будет 1 */
  }
}

/** Общие настройки меню: на сколько человек готовить по умолчанию. Синхронизируются. */
export const useSettingsStore = defineStore('settings', () => {
  void migrateLocal();
  const row = useLiveQuery<(Settings & { deleted?: boolean }) | undefined>(() => db.settings.get(ID), undefined);
  const people = computed(() => (row.value && !row.value.deleted && row.value.people > 0 ? row.value.people : 1));
  const setPeople = (n: number) => save('settings', [{ id: ID, people: Math.max(1, Math.round(n) || 1) }]);
  return { people, setPeople };
});
