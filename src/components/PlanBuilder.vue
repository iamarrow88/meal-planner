<template>
  <div>
    <h2>План питания</h2>
    <input v-model="planName" placeholder="Название плана" />
    <select v-model="period">
      <option value="day">День</option>
      <option value="week">Неделя</option>
      <option value="month">Месяц</option>
    </select>
    <input v-model="startDate" type="date" />
    <button @click="buildPlan">Сохранить план</button>

    <div class="plan-grid">
      <div v-for="slot in slots" :key="slot" class="slot">
        <label>{{ slot }}</label>
        <select v-model="selection[slot].breakfast">
          <option value="">Завтрак</option>
          <option v-for="meal in mealsByTag('breakfast')" :key="meal.id" :value="meal.id">{{ meal.name }}</option>
        </select>
        <select v-model="selection[slot].lunch">
          <option value="">Обед</option>
          <option v-for="meal in mealsByTag('lunch')" :key="meal.id" :value="meal.id">{{ meal.name }}</option>
        </select>
        <select v-model="selection[slot].dinner">
          <option value="">Ужин</option>
          <option v-for="meal in mealsByTag('dinner')" :key="meal.id" :value="meal.id">{{ meal.name }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { db } from '../db';

const props = defineProps({ meals: Array });
const emit = defineEmits(['saved']);

const planName = ref('Мой план');
const period = ref('day');
const startDate = ref(new Date().toISOString().slice(0, 10));
const slots = computed(() => {
  if (period.value === 'day') return [startDate.value];
  if (period.value === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startDate.value, i));
  return Array.from({ length: 30 }, (_, i) => addDays(startDate.value, i));
});

const selection = reactive({});

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mealsByTag(tag) {
  return props.meals.filter((m) => (m.tags || []).includes(tag));
}

watch(slots, (arr) => {
  arr.forEach((s) => {
    if (!selection[s]) selection[s] = { breakfast: '', lunch: '', dinner: '' };
  });
}, { immediate: true });

async function buildPlan() {
  const plan = {
    id: crypto.randomUUID(),
    name: planName.value,
    period: period.value,
    startDate: startDate.value,
    createdAt: new Date().toISOString(),
  };

  const items = [];
  for (const date of slots.value) {
    for (const mealTag of ['breakfast', 'lunch', 'dinner']) {
      const mealId = selection[date]?.[mealTag];
      if (!mealId) continue;
      const meal = props.meals.find((m) => m.id === mealId);
      if (!meal) continue;
      items.push({
        id: crypto.randomUUID(),
        planId: plan.id,
        date,
        mealTag,
        mealId: meal.id,
        mealName: meal.name,
      });
    }
  }

  const shoppingMap = new Map();
  for (const item of items) {
    const meal = props.meals.find((m) => m.id === item.mealId);
    for (const ing of meal.ingredients || []) {
      const key = `${ing.product}__${ing.unit}`;
      if (!shoppingMap.has(key)) {
        shoppingMap.set(key, {
          product: ing.product,
          unit: ing.unit,
          quantity: 0,
          usage: [],
        });
      }
      const row = shoppingMap.get(key);
      row.quantity += Number(ing.quantity || 0);
      row.usage.push(`${item.date} — ${item.mealName}`);
    }
  }

  const shoppingItems = Array.from(shoppingMap.values()).map((x) => ({
    ...x,
    usage: x.usage.join('; '),
  }));

  await db.plans.put(plan);
  await db.planItems.bulkPut(items);
  await db.shoppingLists.put({
    id: crypto.randomUUID(),
    planId: plan.id,
    createdAt: new Date().toISOString(),
  });
  await db.shoppingItems.bulkPut(
      shoppingItems.map((x) => ({
        id: crypto.randomUUID(),
        shoppingListId: plan.id,
        ...x,
      }))
  );

  emit('saved', { plan, items, shoppingItems });
}
</script>