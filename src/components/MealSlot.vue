<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import GroupPicker from '@/components/GroupPicker.vue';
import LeftoverStatus from '@/components/LeftoverStatus.vue';
import { optionKey } from '@/lib/leftovers';
import { missingProducts, suggestSets } from '@/lib/matching';
import { MEAL_LABELS, type Meal, type MealChoice, type MealSet, type SetGroup } from '@/lib/types';
import { useFavoritesStore } from '@/stores/favorites';
import { useLeftoversStore } from '@/stores/leftovers';
import { useRatingsStore } from '@/stores/ratings';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';
import { useSettingsStore } from '@/stores/settings';

/** start — номер дня в периоде: каждый день начинает предложения с других сетов, чтобы неделя не повторялась. */
const props = defineProps<{
  date: string;
  meal: Meal;
  sets: MealSet[];
  choice?: MealChoice;
  products?: string[];
  start?: number;
  /** Число человек этого дня (своё у дня или обычное). */
  dayPeople?: number;
}>();
const emit = defineEmits<{ change: [choice: MealChoice | undefined] }>();

const favorites = useFavoritesStore();
const ratings = useRatingsStore();
const prefs = { isFavorite: favorites.has, setRating: ratings.ofSet, recipeRating: ratings.ofRecipe };
const recipes = useRecipesStore();
const allSets = useSetsStore();
const leftovers = useLeftoversStore();
const settings = useSettingsStore();
const dayPeople = computed(() => props.dayPeople ?? settings.people);

// при смене сета число персон этого приёма пищи сохраняется
const keepPeople = () => (props.choice?.people ? { people: props.choice.people } : {});

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
  emit('change', { ...choice, ...keepPeople() });
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
  emit('change', setId ? { setId, picks: {}, ...keepPeople() } : undefined);
}

function pickOptions(group: SetGroup, picked: string[]) {
  const picks = { ...props.choice!.picks, [group.id]: picked };
  // «готовлю заново» у вариантов, которые больше не выбраны, не нужно
  const fresh = Object.fromEntries(
    Object.entries(props.choice!.fresh ?? {}).filter(([key]) => {
      const [g, o] = key.split(':');
      return picks[g]?.includes(o);
    }),
  );
  const next: MealChoice = { ...props.choice!, picks };
  if (Object.keys(fresh).length) next.fresh = fresh;
  else delete next.fresh;
  emit('change', next);
}

// блюда из остатков: что нужно этому приёму пищи и откуда оно берётся
const needsOf = (group: SetGroup) =>
  leftovers.needs.filter((n) => n.date === props.date && n.meal === props.meal && n.groupId === group.id);

function setFresh(groupId: string, optionId: string, on: boolean) {
  const fresh = { ...(props.choice!.fresh ?? {}) };
  if (on) fresh[optionKey(groupId, optionId)] = new Date().toISOString();
  else delete fresh[optionKey(groupId, optionId)];
  const next: MealChoice = { ...props.choice!, fresh };
  if (!Object.keys(fresh).length) delete next.fresh;
  emit('change', next);
}

function setPeople(e: Event) {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  const next: MealChoice = { ...props.choice! };
  if (n > 0 && n !== dayPeople.value) next.people = n;
  else delete next.people;
  emit('change', next);
}

// «Уже приготовлено»: сеты этого приёма пищи с блюдом, которого есть свободный остаток
const cooked = computed(() => {
  if (props.choice) return [];
  const list: { set: MealSet; title: string; choice: MealChoice }[] = [];
  for (const s of props.sets) {
    for (const group of s.groups) {
      for (const option of group.options) {
        if (!option.recipe || !(leftovers.freeOn(option.recipe, props.date) > 0)) continue;
        const title = recipes.byId.get(option.recipe)?.title ?? option.label;
        const picks = group.pick ? { [group.id]: [option.id] } : {};
        list.push({ set: s, title, choice: { setId: s.id, picks } });
      }
    }
  }
  return list;
});
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
    <div v-if="choice && set" class="flex items-center gap-2">
      <span class="hint">На сколько человек</span>
      <input
        type="number"
        min="1"
        inputmode="numeric"
        class="w-[64px]"
        :value="choice.people ?? dayPeople"
        aria-label="На сколько человек этот приём пищи"
        @change="setPeople"
      />
      <span v-if="choice.people && choice.people !== dayPeople" class="hint">(в этот день {{ dayPeople }})</span>
    </div>
    <div v-if="cooked.length" class="flex flex-col gap-1.5">
      <span class="hint">🍲 Уже приготовлено — нажмите, чтобы выбрать:</span>
      <button
        v-for="c in cooked"
        :key="c.set.id + c.title"
        class="chip flex flex-col items-start gap-0.5"
        @click="emit('change', c.choice)"
      >
        <span>{{ c.title }}</span>
        <span class="hint font-normal">в сете «{{ c.set.name }}»</span>
      </button>
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
      <template v-for="group in set.groups" :key="group.id">
        <GroupPicker
          :group="group"
          :picked="choice?.picks?.[group.id] ?? []"
          required
          @change="(picked) => pickOptions(group, picked)"
        />
        <LeftoverStatus
          v-for="n in needsOf(group)"
          :key="n.optionId"
          :need="n"
          @fresh="(on) => setFresh(n.groupId, n.optionId, on)"
        />
      </template>
      <p v-if="products?.length && !browsing && (missingNow.length || allPicked)" class="hint">
        {{ missingNow.length ? `Ещё нужно для выбранных блюд: ${missingNow.join(', ')}` : 'Всё для выбранных блюд есть дома.' }}
      </p>
    </template>
  </div>
</template>
