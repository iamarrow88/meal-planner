<script setup lang="ts">
import { computed } from 'vue';
import AddToMenu from '@/components/AddToMenu.vue';
import GroupPicker from '@/components/GroupPicker.vue';
import { MEAL_LABELS, type SetGroup } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { useSetsStore } from '@/stores/sets';

const props = defineProps<{ id: string }>();
const store = useSetsStore();
const favorites = useFavoritesStore();

const set = computed(() => store.byId.get(props.id));
const picks = computed(() => store.drafts[props.id] ?? {});
const picked = (group: SetGroup) => picks.value[group.id] ?? [];

function pickOptions(group: SetGroup, next: string[]) {
  store.drafts[props.id] = { ...picks.value, [group.id]: next };
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

      <button
        class="btn-secondary self-start"
        :aria-pressed="favorites.has(set.id)"
        @click="favorites.toggle(set.id)"
      >
        {{ favorites.has(set.id) ? '★ В избранном' : '☆ Добавить в избранное' }}
      </button>
      <AddToMenu :set="set" :picks="picks" />

      <p class="hint">Сет редактируется в Obsidian. После правок загрузите папку заново на вкладке «Данные».</p>
    </template>
  </section>
</template>
