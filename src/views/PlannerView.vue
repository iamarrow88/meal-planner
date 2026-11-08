<script setup lang="ts">
import { computed, ref } from 'vue';
import MealSlot from '@/components/MealSlot.vue';
import PeriodBar from '@/components/PeriodBar.vue';
import ProductPicker from '@/components/ProductPicker.vue';
import SavedMenus from '@/components/SavedMenus.vue';
import { formatDay, today } from '@/lib/dates';
import { MEALS } from '@/lib/types';
import { usePantryStore } from '@/stores/pantry';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';

const plan = usePlanStore();
const sets = useSetsStore();
const pantry = usePantryStore();

// поиск по продуктам раскрыт, если его открыли или в этот день уже выбраны продукты
const opened = ref<string[]>([]);
const showPantry = (date: string) => opened.value.includes(date) || pantry.get(date).length > 0;
const openPantry = (date: string) => (opened.value = [...opened.value, date]);

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
      <div v-for="day in plan.days" :key="day.date" class="card" :class="{ 'border-accent': day.date === today() }">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold first-letter:uppercase">{{ formatDay(day.date) }}</h3>
          <div class="flex items-center gap-3">
            <button v-if="!showPantry(day.date)" class="link text-[13px]" @click="openPantry(day.date)">
              🧺 Подобрать по продуктам
            </button>
            <button v-if="Object.keys(day.meals).length" class="link text-[13px]" @click="plan.clearDay(day.date)">
              Очистить
            </button>
          </div>
        </div>
        <ProductPicker
          v-if="showPantry(day.date)"
          class="mt-2.5"
          :catalog="pantry.catalog"
          :selected="pantry.get(day.date)"
          @change="(keys) => pantry.set(day.date, keys)"
        />
        <MealSlot
          v-for="meal in meals"
          :key="meal"
          :meal="meal"
          :sets="setsFor(meal)"
          :choice="day.meals[meal]"
          :products="pantry.get(day.date)"
          @change="(c) => plan.setMeal(day, meal, c)"
        />
      </div>
    </template>
  </section>
</template>
