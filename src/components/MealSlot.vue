<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import GroupPicker from '@/components/GroupPicker.vue';
import { missingProducts, suggestSets } from '@/lib/matching';
import { MEAL_LABELS, type Meal, type MealChoice, type MealSet, type SetGroup } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { useRatingsStore } from '@/stores/ratings';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

/** start — номер дня в периоде: каждый день начинает предложения с других сетов, чтобы неделя не повторялась. */
const props = defineProps<{ meal: Meal; sets: MealSet[]; choice?: MealChoice; products?: string[]; start?: number }>();
const emit = defineEmits<{ change: [choice: MealChoice | undefined] }>();

const favorites = useFavoritesStore();
const ratings = useRatingsStore();
const prefs = { isFavorite: favorites.has, setRating: ratings.ofSet, recipeRating: ratings.ofRecipe };
const recipes = useRecipesStore();
const allSets = useSetsStore();

const PAGE = 3;

// по три сета, где больше всего продуктов, которые есть дома; «Другие» показывают следующие три
const firstOffset = () => {
  const total = suggestSets(props.sets, props.products ?? [], recipes.byId, prefs, 0).total;
  const pages = Math.ceil(total / PAGE);
  return pages ? ((props.start ?? 0) % pages) * PAGE : 0;
};
const offset = ref(firstOffset());
const suggestions = computed(() =>
  suggestSets(props.sets, props.products ?? [], recipes.byId, prefs, PAGE, offset.value),
);

// после последних вариантов — снова с начала
const showOthers = () => {
  const next = offset.value + PAGE;
  offset.value = next < suggestions.value.total ? next : 0;
};

// другой набор продуктов — другие сеты, показываем лучшие с начала
// и когда загрузились сеты и рецепты: до этого подходящих сетов ещё не видно
watch(
  () => `${(props.products ?? []).join()}|${props.sets.length}|${recipes.byId.size}|${props.start}`,
  () => (offset.value = firstOffset()),
);

// когда сет выбран, предложения прячутся; «Подобрать другой» открывает их снова
const browsing = ref(false);
const showSuggestions = computed(() => !!props.products?.length && (!props.choice || browsing.value));

function pickSuggestion(choice: MealChoice) {
  browsing.value = false;
  emit('change', choice);
}

// сет можно поставить и на другой приём пищи («Добавить в меню»), поэтому ищем среди всех
const set = computed(() => (props.choice ? allSets.byId.get(props.choice.setId) : undefined));
const foreign = computed(() => set.value && set.value.meal !== props.meal);

// что докупить для выбранного сета — по тем вариантам, что выбраны сейчас, а не по подобранным автоматически
const missingNow = computed(() =>
  set.value && props.choice && props.products?.length
    ? missingProducts(set.value, props.choice, props.products, recipes.byId)
    : [],
);
// пока где-то не выбран вариант, «всё есть» сказать нельзя
const allPicked = computed(() => !!set.value?.groups.every((g) => !g.pick || props.choice?.picks?.[g.id]?.length));
const missingOf = (s: { set: MealSet; missing: string[] }) => (s.set.id === props.choice?.setId ? missingNow.value : s.missing);

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
        <option v-if="foreign" :value="set!.id">{{ set!.name }} ({{ MEAL_LABELS[set!.meal].toLowerCase() }})</option>
        <optgroup v-for="g in setGroups" :key="g.label" :label="g.label">
          <option v-for="s in g.sets" :key="s.id" :value="s.id">{{ s.name }}</option>
        </optgroup>
      </select>
    </div>
    <button v-if="products?.length && choice && !browsing" class="link text-[13px]" @click="browsing = true">
      🧺 Подобрать другой по продуктам
    </button>
    <div v-if="showSuggestions && suggestions.items.length" class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <span class="hint">Подходит по продуктам — нажмите, чтобы выбрать:</span>
        <span v-if="suggestions.total > PAGE" class="hint shrink-0">
          {{ offset + 1 }}–{{ offset + suggestions.items.length }} из {{ suggestions.total }}
        </span>
      </div>
      <button
        v-for="s in suggestions.items"
        :key="s.set.id"
        class="chip flex flex-col items-start gap-0.5"
        :class="{ 'chip-on': choice?.setId === s.set.id }"
        :title="missingOf(s).length ? `Ещё нужно: ${missingOf(s).join(', ')}` : undefined"
        @click="pickSuggestion(s.choice)"
      >
        <span>{{ favorites.has(s.set.id) ? '★ ' : '' }}{{ s.set.name }}</span>
        <!-- сколько поместится в две строки, начиная с первых продуктов сета -->
        <span v-if="missingOf(s).length" class="hint line-clamp-2 font-normal">ещё нужно: {{ missingOf(s).join(', ') }}</span>
        <span v-else class="hint font-normal">всё есть</span>
      </button>
      <div class="flex gap-4">
        <button v-if="suggestions.total > PAGE" class="link text-[14px]" @click="showOthers">
          {{ offset + PAGE >= suggestions.total ? '↺ К первым вариантам' : 'Другие ›' }}
        </button>
        <button v-if="browsing" class="link text-[14px] text-muted" @click="browsing = false">Скрыть</button>
      </div>
    </div>
    <p v-else-if="showSuggestions" class="hint">Сетов с этими продуктами нет.</p>
    <p v-if="choice && !set" class="text-[13px] text-warn">Этого сета больше нет — выберите другой.</p>
    <template v-if="set">
      <p v-if="set.note" class="hint">{{ set.note }}</p>
      <GroupPicker
        v-for="group in set.groups"
        :key="group.id"
        :group="group"
        :picked="choice?.picks?.[group.id] ?? []"
        required
        @change="(picked) => pickOptions(group, picked)"
      />
      <p v-if="products?.length && !browsing && (missingNow.length || allPicked)" class="hint">
        {{ missingNow.length ? `Ещё нужно для выбранных блюд: ${missingNow.join(', ')}` : 'Всё для выбранных блюд есть дома.' }}
      </p>
    </template>
  </div>
</template>
