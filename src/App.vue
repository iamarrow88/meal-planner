<template>
  <div class="app">
    <header class="topbar">
      <h1>Meal Planner</h1>
      <div class="actions">
        <button @click="exportPdf">Экспорт PDF</button>
        <button @click="resetDemo">Сбросить демо</button>
      </div>
    </header>

    <main class="grid">
      <section class="panel">
        <MealForm @saved="reloadMeals" />
      </section>

      <section class="panel">
        <TagFilter :tags="allTags" v-model="selectedTag" />
        <MealList :meals="filteredMeals" @edit="startEdit" @delete="deleteMeal" />
      </section>

      <section class="panel">
        <PlanBuilder
            :meals="meals"
            @saved="onPlanSaved"
        />
      </section>

      <section class="panel">
        <ShoppingList :items="shoppingItems" />
      </section>

      <section class="panel">
        <div class="saved-plans">
          <div v-for="plan in plans" :key="plan.id">
            <div class="saved-plans__line">
              {{plan.name}} - for a {{plan.period}} - start at {{plan.startDate}}
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import {computed, onMounted, ref, watch} from 'vue';
import { db, seedIfEmpty } from './db';
import { exportPlanPdf } from './pdf.js';


import MealForm from './components/MealForm.vue';
import MealList from './components/MealList.vue';
import PlanBuilder from './components/PlanBuilder.vue';
import ShoppingList from './components/ShoppingList.vue';
import TagFilter from './components/TagFilter.vue';

const meals = ref([]);
const plans = ref([]);
const selectedTag = ref('all');
const shoppingItems = ref([]);
const currentPlan = ref(null);
const currentPlanItems = ref([]);

const allTags = computed(() => {
  const set = new Set();
  meals.value.forEach((m) => (m.tags || []).forEach((t) => set.add(t)));
  return ['all', ...Array.from(set)];
});

const filteredMeals = computed(() => {
  if (selectedTag.value === 'all') return meals.value;
  return meals.value.filter((m) => (m.tags || []).includes(selectedTag.value));
});

async function reloadMeals() {
  meals.value = await db.meals.orderBy('name').toArray();
}

async function reloadPlans() {
  plans.value = await db.plans.orderBy('period').toArray();
}

watch(plans, (newPlans, oldPlans) => {
  console.log(`oldPlans`);
  console.log(oldPlans);
  console.log(`newPlans`);
  console.log(newPlans);
  plans.value = newPlans;

})
/*
watch(plans, (arr) => {
  arr.forEach(item => console.log(item));
})
*/


async function deleteMeal(id) {
  await db.meals.delete(id);
  await reloadMeals();
}

async function startEdit(meal) {
  await db.meals.put(meal);
  await reloadMeals();
}

async function onPlanSaved(payload) {
  currentPlan.value = payload.plan;
  currentPlanItems.value = payload.items;
  shoppingItems.value = payload.shoppingItems;
}

function exportPdf() {
  if (!currentPlan.value) return;
  exportPlanPdf({
    plan: currentPlan.value,
    items: currentPlanItems.value,
    shoppingRows: shoppingItems.value,
  });
}

async function resetDemo() {
  await db.meals.clear();
  await db.plans.clear();
  await db.planItems.clear();
  await db.shoppingLists.clear();
  await db.shoppingItems.clear();
  await seedIfEmpty();
  await reloadMeals();
  shoppingItems.value = [];
  currentPlan.value = null;
  currentPlanItems.value = [];
}

onMounted(async () => {
  await seedIfEmpty();
  await reloadMeals();
  await reloadPlans();
});
</script>