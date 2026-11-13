import { createClient, type User } from '@supabase/supabase-js';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { allTables, db, KINDS, primaryKey, setLocalChangeListener, stripMeta, type Kind, type SyncMeta } from '@/lib/db';

// нужен адрес проекта (https://….supabase.co); если вставили адрес REST API с «/rest/v1/», хвост отрезаем,
// иначе вход и регистрация уходят на несуществующий путь и Supabase отвечает «Invalid path specified in request URL»
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabase = url && anonKey ? createClient(url, anonKey) : null;

export type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

interface RemoteRow {
  kind: Kind;
  id: string;
  data: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
  synced_at: string;
}

const PAGE = 1000;
const EPOCH = '1970-01-01T00:00:00Z';
const cursorKey = (userId: string) => `sync-cursor:${userId}`;

function readCursor(userId: string) {
  try {
    return localStorage.getItem(cursorKey(userId)) ?? EPOCH;
  } catch {
    return EPOCH;
  }
}

function writeCursor(userId: string, value: string) {
  try {
    localStorage.setItem(cursorKey(userId), value);
  } catch {
    /* без курсора в следующий раз просто скачаем всё заново */
  }
}

/** Скачивает изменения с сервера; более новая версия записи побеждает. */
async function pull(userId: string) {
  // небольшой запас назад: строки, записанные параллельно, не потеряются, а повторы безвредны
  const since = new Date(new Date(readCursor(userId)).getTime() - 5000).toISOString();
  let cursor = readCursor(userId);
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from('items')
      .select('kind, id, data, updated_at, deleted, synced_at')
      .gt('synced_at', since)
      .order('synced_at')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as RemoteRow[];

    await db.transaction('rw', allTables(), async () => {
      for (const row of rows) {
        if (!(KINDS as readonly string[]).includes(row.kind)) continue;
        const table = db.table(row.kind);
        const local = (await table.get(row.id)) as SyncMeta | undefined;
        if (local && (local.updatedAt ?? 0) >= row.updated_at) continue;
        await table.put({
          ...row.data,
          [primaryKey(row.kind)]: row.id,
          updatedAt: row.updated_at,
          deleted: row.deleted,
          dirty: 0,
        });
      }
    });

    if (rows.length) cursor = rows[rows.length - 1].synced_at;
    if (rows.length < PAGE) break;
  }
  writeCursor(userId, cursor);
}

/** Отправляет на сервер всё, что изменилось локально. */
async function push(userId: string) {
  for (const kind of KINDS) {
    const table = db.table(kind);
    const dirty = (await table.where('dirty').equals(1).toArray()) as (SyncMeta & Record<string, unknown>)[];
    for (let i = 0; i < dirty.length; i += PAGE) {
      const chunk = dirty.slice(i, i + PAGE);
      const { error } = await supabase!.from('items').upsert(
        chunk.map((r) => ({
          user_id: userId,
          kind,
          id: String(r[primaryKey(kind)]),
          data: stripMeta(r),
          updated_at: r.updatedAt ?? Date.now(),
          deleted: !!r.deleted,
        })),
        { onConflict: 'user_id,kind,id' },
      );
      if (error) throw error;
      // снимаем отметку, только если запись не успели изменить ещё раз во время отправки
      await db.transaction('rw', table, async () => {
        for (const r of chunk) {
          const key = r[primaryKey(kind)] as string;
          const current = (await table.get(key)) as SyncMeta | undefined;
          if (current && current.updatedAt === r.updatedAt) await table.update(key, { dirty: 0 });
        }
      });
    }
  }
}

export const useSyncStore = defineStore('sync', () => {
  const configured = !!supabase;
  const user = ref<User | null>(null);
  const state = ref<SyncState>('off');
  const lastSync = ref<Date>();
  const error = ref<string>();

  const statusText = computed(() => {
    switch (state.value) {
      case 'syncing':
        return 'Синхронизация…';
      case 'offline':
        return 'Нет сети — изменения отправятся позже';
      case 'error':
        return `Ошибка синхронизации: ${error.value}`;
      case 'idle':
        return lastSync.value
          ? `Синхронизировано в ${lastSync.value.toLocaleTimeString('ru-RU', { timeStyle: 'short' })}`
          : 'Вход выполнен';
      default:
        return 'Не синхронизируется';
    }
  });

  let running: Promise<void> | null = null;
  let again = false;

  function syncNow(): Promise<void> {
    if (!supabase || !user.value) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        if (!navigator.onLine) {
          state.value = 'offline';
          return;
        }
        const userId = user.value!.id;
        state.value = 'syncing';
        error.value = undefined;
        try {
          await pull(userId);
          await push(userId);
          state.value = 'idle';
          lastSync.value = new Date();
        } catch (e) {
          state.value = 'error';
          error.value = (e as Error).message ?? String(e);
          return;
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  function scheduleSync(delay = 1500) {
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, delay);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** Возвращает true, если нужно подтвердить почту по ссылке из письма. */
  async function signUp(email: string, password: string) {
    const { data, error } = await supabase!.auth.signUp({ email, password });
    if (error) throw error;
    return !data.session;
  }

  async function signOut() {
    await supabase!.auth.signOut();
  }

  function init() {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      const changed = next?.id !== user.value?.id;
      user.value = next;
      if (!next) state.value = 'off';
      else if (state.value === 'off') state.value = 'idle';
      if (next && changed) setTimeout(syncNow, 0);
    });
    setLocalChangeListener(() => scheduleSync());
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => {
      if (user.value) state.value = 'offline';
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') syncNow();
    }, 60_000);
  }

  return { configured, user, state, lastSync, error, statusText, syncNow, signIn, signUp, signOut, init };
});
