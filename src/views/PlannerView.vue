<script setup lang="ts">
import { computed, ref } from 'vue';
import MealSlot from '@/components/MealSlot.vue';
import PeriodBar from '@/components/PeriodBar.vue';
import SaveDay from '@/components/SaveDay.vue';
import SavedMenus from '@/components/SavedMenus.vue';
import { formatDay, today } from '@/lib/dates';
import { MEALS } from '@/lib/types';
import { usePantryStore } from '@/stores/pantry';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';
import { useSettingsStore } from '@/stores/settings';

const plan = usePlanStore();
const sets = useSetsStore();
const pantry = usePantryStore();
const settings = useSettingsStore();

// продукты дома выбираются на главной и действуют на все дни
const pantryNames = computed(() => pantry.items.map(pantry.nameOf).join(', '));

// на неделе каждый день можно сохранить отдельным дневным меню; форма открыта у одного дня
const savingDate = ref('');

// показываем только приёмы пищи, для которых есть хотя бы один сет
const meals = computed(() => MEALS.filter((m) => sets.sets.some((s) => s.meal === m)));
const setsFor = (meal: string) => sets.sets.filter((s) => s.meal === meal);
</script>

<template>
  <section class="flex flex-col gap-3">
    <PeriodBar />
    <p v-if="!meals.length" class="py-6 text-center text-muted">
      Сначала загрузите папку из Obsidian на вкладке
      <RouterLink to="/data" class="text-accent">«Данные»</RouterLink> — тогда здесь можно будет выбрать блюда.
    </p>
    <template v-else>
      <SavedMenus />
      <label class="flex items-center gap-2.5">
        <span class="hint">На сколько человек на эту неделю</span>
        <input
          type="number"
          min="1"
          inputmode="numeric"
          class="w-[72px]"
          :value="settings.people"
          @change="plan.setWeekPeople(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <p class="hint">
        <template v-if="pantry.items.length">
          🧺 Подбираю сеты по продуктам дома: {{ pantryNames }}.
          <RouterLink to="/home" class="text-accent">Изменить</RouterLink>
        </template>
        <template v-else>
          🧺 Отметьте <RouterLink to="/home" class="text-accent">на главной</RouterLink>, какие продукты есть дома, — здесь
          появятся подходящие сеты.
        </template>
      </p>
      <div v-for="(day, i) in plan.days" :key="day.date" class="card" :class="{ 'border-accent': day.date === today() }">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 class="mr-auto font-semibold first-letter:uppercase">{{ formatDay(day.date) }}</h3>
          <label class="flex items-center gap-1" :class="day.people ? 'text-accent' : 'text-muted'">
            <span aria-hidden="true">👥</span>
            <input
              type="number"
              min="1"
              inputmode="numeric"
              class="w-[56px]"
              :value="day.people ?? settings.people"
              :aria-label="'На сколько человек: ' + formatDay(day.date)"
              @change="plan.setDayPeople(day.date, Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <div v-if="Object.keys(day.meals).length" class="flex items-center gap-3 whitespace-nowrap">
            <button
              v-if="plan.length === 7"
              class="link text-[13px]"
              :aria-expanded="savingDate === day.date"
              @click="savingDate = savingDate === day.date ? '' : day.date"
            >
              💾 Сохранить день
            </button>
            <button class="link text-[13px]" @click="plan.clearDay(day.date)">Очистить</button>
          </div>
        </div>
        <SaveDay :day="day" :open="savingDate === day.date" @close="savingDate = ''" />
        <MealSlot
          v-for="meal in meals"
          :key="meal"
          :date="day.date"
          :meal="meal"
          :sets="setsFor(meal)"
          :choice="day.meals[meal]"
          :products="pantry.items"
          :start="i"
          :day-people="day.people ?? settings.people"
          @change="(c) => plan.setMeal(day, meal, c)"
        />
      </div>
    </template>
  </section>
</template>
