<script setup lang="ts">
import { computed } from 'vue';
import GroupPicker from '@/components/GroupPicker.vue';
import { MEAL_LABELS, type Meal, type MealChoice, type MealSet, type SetGroup } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';

const props = defineProps<{ meal: Meal; sets: MealSet[]; choice?: MealChoice }>();
const emit = defineEmits<{ change: [choice: MealChoice | undefined] }>();

const favorites = useFavoritesStore();

const set = computed(() => props.sets.find((s) => s.id === props.choice?.setId));

// избранные сеты наверху списка
const setGroups = computed(() => {
  const liked = props.sets.filter((s) => favorites.has(s.id));
  if (!liked.length) return [{ label: 'Все сеты', sets: props.sets }];
  return [
    { label: '★ Избранное', sets: liked },
    { label: 'Остальные', sets: props.sets.filter((s) => !favorites.has(s.id)) },
  ];
});

function pickSet(e: Event) {
  const setId = (e.target as HTMLSelectElement).value;
  emit('change', setId ? { setId, picks: {} } : undefined);
}

function pickOptions(group: SetGroup, picked: string[]) {
  emit('change', { ...props.choice!, picks: { ...props.choice!.picks, [group.id]: picked } });
}
</script>

<template>
  <div class="mt-2.5 flex flex-col gap-2.5 border-t border-line pt-2.5 pb-1">
    <div class="flex items-center gap-2.5">
      <span class="w-[76px] shrink-0 font-semibold">{{ MEAL_LABELS[meal] }}</span>
      <select class="min-w-0 flex-1" :value="choice?.setId ?? ''" @change="pickSet">
        <option value="">— не выбрано —</option>
        <optgroup v-for="g in setGroups" :key="g.label" :label="g.label">
          <option v-for="s in g.sets" :key="s.id" :value="s.id">{{ s.name }}</option>
        </optgroup>
      </select>
    </div>
    <p v-if="choice && !set" class="text-[13px] text-warn">Этого сета больше нет — выберите другой.</p>
    <template v-if="set">
      <p v-if="set.note" class="hint">{{ set.note }}</p>
      <GroupPicker
        v-for="group in set.groups"
        :key="group.id"
        :group="group"
        :picked="choice?.picks?.[group.id] ?? []"
        @change="(picked) => pickOptions(group, picked)"
      />
    </template>
  </div>
</template>
