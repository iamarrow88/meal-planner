<script setup lang="ts">
import { computed } from 'vue';
import MealSlot from '@/components/MealSlot.vue';
import PeriodBar from '@/components/PeriodBar.vue';
import { formatDay, today } from '@/lib/dates';
import { MEALS } from '@/lib/types';
import { usePlanStore } from '@/stores/plan';
import { useSetsStore } from '@/stores/sets';

const plan = usePlanStore();
const sets = useSetsStore();

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
      <div v-for="day in plan.days" :key="day.date" class="card" :class="{ 'border-accent': day.date === today() }">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold first-letter:uppercase">{{ formatDay(day.date) }}</h3>
          <button v-if="Object.keys(day.meals).length" class="link text-[13px]" @click="plan.clearDay(day.date)">
            Очистить
          </button>
        </div>
        <MealSlot
          v-for="meal in meals"
          :key="meal"
          :meal="meal"
          :sets="setsFor(meal)"
          :choice="day.meals[meal]"
          @change="(c) => plan.setMeal(day, meal, c)"
        />
      </div>
    </template>
  </section>
</template>
