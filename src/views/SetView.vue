<script setup lang="ts">
import { computed, ref } from 'vue';
import GroupPicker from '@/components/GroupPicker.vue';
import { formatDay, today } from '@/lib/dates';
import { useLiveQuery } from '@/lib/live';
import { MEAL_LABELS, type DayPlan, type SetGroup } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';

const props = defineProps<{ id: string }>();
const store = useSetsStore();
const plan = usePlanStore();
const favorites = useFavoritesStore();

const set = computed(() => store.byId.get(props.id));
const picks = computed(() => store.drafts[props.id] ?? {});
const picked = (group: SetGroup) => picks.value[group.id] ?? [];

function pickOptions(group: SetGroup, next: string[]) {
  store.drafts[props.id] = { ...picks.value, [group.id]: next };
}

// что ещё не выбрано: в покупки такая группа не попадёт, пока выбор не сделан
const unpicked = computed(() =>
  (set.value?.groups ?? []).filter((g) => {
    if (g.pick === 0) return false;
    const need = g.pick === 2 && !g.halves ? Math.min(2, g.options.length) : 1;
    return picked(g).length < need;
  }),
);

const adding = ref(false);
const date = ref(today());
const addedTo = ref('');

const day = useLiveQuery<DayPlan | undefined>(() => plan.getDay(date.value), undefined, date);
const existing = computed(() => {
  const choice = set.value && day.value?.date === date.value ? day.value.meals[set.value.meal] : undefined;
  return choice && (store.byId.get(choice.setId)?.name ?? 'сет, которого больше нет');
});

function openAdding() {
  adding.value = !adding.value;
  addedTo.value = '';
}

async function addToMenu() {
  await plan.addToDate(date.value, set.value!.meal, { setId: props.id, picks: picks.value });
  addedTo.value = date.value;
  adding.value = false;
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <RouterLink to="/sets" class="link">‹ Все сеты</RouterLink>
    <p v-if="!set" class="py-6 text-center text-muted">Сет не найден.</p>
    <template v-else>
      <div>
        <div class="hint">{{ MEAL_LABELS[set.meal] }} · {{ set.source }}</div>
        <h2 class="text-[22px] font-bold">{{ set.name }}</h2>
        <p v-if="set.note" class="hint mt-1">{{ set.note }}</p>
      </div>

      <div v-for="group in set.groups" :key="group.id" class="card">
        <GroupPicker :group="group" :picked="picked(group)" @change="(next) => pickOptions(group, next)" />
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" @click="openAdding">Добавить в меню</button>
        <button class="btn-secondary" :aria-pressed="favorites.has(set.id)" @click="favorites.toggle(set.id)">
          {{ favorites.has(set.id) ? '★ В избранном' : '☆ Добавить в избранное' }}
        </button>
      </div>

      <div v-if="adding" class="card flex flex-col gap-2.5">
        <label class="flex items-center gap-2.5">
          <span class="font-medium">Дата</span>
          <input v-model="date" type="date" class="min-w-0 flex-1" />
        </label>
        <p v-if="unpicked.length" class="hint">
          Не выбрано: {{ unpicked.map((g) => g.title).join(', ') }}. Это можно выбрать и позже в меню, но пока выбора нет,
          в список покупок эти блюда не попадут.
        </p>
        <p v-if="existing" class="text-[13px] text-warn">
          На эту дату {{ MEAL_LABELS[set.meal].toLowerCase() }} уже выбран: {{ existing }}. Он будет заменён.
        </p>
        <button class="btn-primary self-start" :disabled="!date" @click="addToMenu">
          {{ existing ? 'Заменить' : 'Добавить' }}
        </button>
      </div>

      <p v-if="addedTo" class="text-[13px]">
        Добавлено на {{ formatDay(addedTo) }}.
        <RouterLink to="/menu" class="text-accent" @click="plan.showDate(addedTo)">Открыть меню ›</RouterLink>
      </p>

      <p class="hint">Сет редактируется в Obsidian. После правок загрузите папку заново на вкладке «Данные».</p>
    </template>
  </section>
</template>
