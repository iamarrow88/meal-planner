import { liveQuery, type Subscription } from 'dexie';
import { onScopeDispose, shallowRef, watch, type Ref, type WatchSource } from 'vue';

/**
 * Реактивный результат запроса к IndexedDB: обновляется при любом изменении данных.
 * Если передан `deps`, запрос перезапускается при их изменении.
 */
export function useLiveQuery<T>(query: () => Promise<T>, initial: T, deps?: WatchSource): Ref<T> {
  const result = shallowRef(initial) as Ref<T>;
  let sub: Subscription | undefined;

  const start = () => {
    sub?.unsubscribe();
    sub = liveQuery(query).subscribe({
      next: (value) => (result.value = value),
      error: (e) => console.error(e),
    });
  };

  if (deps) watch(deps, start, { immediate: true });
  else start();
  onScopeDispose(() => sub?.unsubscribe());

  return result;
}
