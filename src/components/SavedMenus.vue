<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, formatDay } from '@/lib/dates';
import type { SavedMenu } from '@/lib/types';
import { dishCount, useMenusStore } from '@/stores/menus';
import { usePlanStore } from '@/stores/plan';

/** listOnly — только список меню (для главной), без кнопок «Сохранить» и «Мои меню». */
const props = defineProps<{ listOnly?: boolean }>();

const plan = usePlanStore();
const store = useMenusStore();

const mode = ref<'closed' | 'save' | 'list'>(props.listOnly ? 'list' : 'closed');
const message = ref('');
const toggle = (m: 'save' | 'list') => {
  mode.value = mode.value === m ? 'closed' : m;
  message.value = '';
  if (m === 'save') resetForm();
};

const filled = (d: { meals: object }) => Object.keys(d.meals).length > 0;
const hasMeals = computed(() => plan.days.some(filled));

// что сохранить: всю неделю или один из дней с выбранными блюдами
const what = ref('week');
const name = ref('');
const dayLabel = (date: string) => formatDay(date).replace(/^./, (c) => c.toUpperCase());
// «8 ноября» без дня недели: название меню переживёт перенос на другие даты
const shortDay = (iso: string) => formatDay(iso).replace(/^[^,]*,\s*/, '');
const defaultName = () =>
  what.value === 'week' ? `Неделя с ${shortDay(plan.start)}` : `День ${shortDay(what.value)}`;

function resetForm() {
  what.value = plan.length === 7 ? 'week' : plan.start;
  name.value = defaultName();
}

function onWhat() {
  name.value = defaultName();
}

async function saveMenu() {
  const title = name.value.trim() || defaultName();
  if (store.byName(title) && !confirm(`Меню «${title}» уже есть. Заменить его?`)) return;
  const days = what.value === 'week' ? plan.days : plan.days.filter((d) => d.date === what.value);
  await store.saveMenu(title, days);
  mode.value = 'list';
  message.value = `Меню «${title}» сохранено.`;
}

const isWeek = (m: SavedMenu) => m.days.length > 1;
const describe = (m: SavedMenu) => {
  const n = dishCount(m);
  const dishes = `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'блюдо' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блюда' : 'блюд'}`;
  return `${isWeek(m) ? 'Неделя' : 'День'} · ${dishes}`;
};

// меню начинается с любого дня открытого периода: неделя со среды займёт среду — вторник следующей недели
const targets = ref<Record<string, string>>({});
const targetFor = (m: SavedMenu) => {
  const picked = targets.value[m.id];
  return picked && plan.dates.includes(picked) ? picked : plan.start;
};

async function apply(m: SavedMenu) {
  const start = targetFor(m);
  if (isWeek(m) && plan.length !== 7) plan.length = 7;
  const busy = (await Promise.all(m.days.map((_, i) => plan.getDay(addDays(start, i))))).some(filled);
  const where = isWeek(m) ? `${formatDay(start)} — ${formatDay(addDays(start, m.days.length - 1))}` : formatDay(start);
  if (busy && !confirm(`На ${where} уже выбраны блюда. Заменить их меню «${m.name}»?`)) return;
  const { skipped } = await store.apply(m, start);
  plan.showDate(start);
  message.value =
    `Меню «${m.name}» подставлено на ${where}.` +
    (skipped ? ` Сетов, которых больше нет в Obsidian, пропущено: ${skipped}.` : '');
}

async function remove(m: SavedMenu) {
  if (!confirm(`Удалить меню «${m.name}»? Запланированные дни не изменятся.`)) return;
  await store.remove(m);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="!listOnly" class="flex flex-wrap gap-2">
      <button class="chip" :class="{ 'chip-on': mode === 'save' }" :disabled="!hasMeals" @click="toggle('save')">
        💾 Сохранить меню
      </button>
      <button class="chip" :class="{ 'chip-on': mode === 'list' }" @click="toggle('list')">
        📋 Мои меню{{ store.menus.length ? ` (${store.menus.length})` : '' }}
      </button>
    </div>

    <form v-if="mode === 'save'" class="card flex flex-col gap-2" @submit.prevent="saveMenu">
      <label v-if="plan.length === 7" class="flex flex-col gap-1">
        <span class="hint">Что сохранить</span>
        <select v-model="what" @change="onWhat">
          <option value="week">Всю неделю: {{ formatDay(plan.start) }} — {{ formatDay(plan.end) }}</option>
          <option v-for="d in plan.days.filter(filled)" :key="d.date" :value="d.date">Только {{ dayLabel(d.date) }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="hint">Название</span>
        <input v-model="name" type="text" maxlength="80" />
      </label>
      <div class="flex gap-2">
        <button type="submit" class="btn btn-primary">Сохранить</button>
        <button type="button" class="btn btn-secondary" @click="mode = 'closed'">Отмена</button>
      </div>
    </form>

    <p v-if="message" class="hint">
      {{ message }}
      <RouterLink v-if="listOnly" to="/menu" class="text-accent">Открыть меню</RouterLink>
    </p>

    <div v-if="mode === 'list'" class="flex flex-col gap-2">
      <p v-if="!store.menus.length" class="hint">
        Сохранённых меню пока нет. Выберите блюда на день или неделю и нажмите «Сохранить меню».
      </p>
      <div v-for="m in store.menus" :key="m.id" class="card flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold">{{ m.name }}</div>
            <div class="hint">{{ describe(m) }}</div>
          </div>
          <button class="link text-[13px]" @click="remove(m)">Удалить</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="isWeek(m) && plan.length === 7" class="hint">С</span>
          <select
            v-if="plan.length === 7 || !isWeek(m)"
            :value="targetFor(m)"
            :aria-label="isWeek(m) ? 'С какого дня' : 'На какой день'"
            @change="targets[m.id] = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="date in plan.dates" :key="date" :value="date">{{ dayLabel(date) }}</option>
          </select>
          <button class="btn btn-primary" @click="apply(m)">
            {{ isWeek(m) && plan.length !== 7 ? `Подставить неделю с ${formatDay(plan.start)}` : 'Подставить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
