<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PeriodBar from '@/components/PeriodBar.vue';
import { buildShoppingList, describeLine, lineTitle } from '@/lib/shopping';
import { usePlanStore } from '@/stores/plan';
import { useRecipesStore } from '@/stores/recipes';
import { useSetsStore } from '@/stores/sets';

const plan = usePlanStore();
const recipes = useRecipesStore();
const sets = useSetsStore();

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — значение просто не запомнится */
  }
}

const people = ref(load('people', 0));
watch(people, (n) => store('people', Number(n) || 0));

// отметки «куплено» запоминаются отдельно для каждого периода
const checkedKey = computed(() => `checked:${plan.start}:${plan.length}`);
const checked = ref<string[]>([]);
watch(checkedKey, (key) => (checked.value = load(key, [])), { immediate: true });

const list = computed(() => buildShoppingList(plan.days, sets.byId, recipes.byId, Number(people.value) || 1));
const left = computed(() => list.value.lines.filter((l) => !checked.value.includes(l.key)).length);

function toggle(key: string) {
  checked.value = checked.value.includes(key) ? checked.value.filter((k) => k !== key) : [...checked.value, key];
  store(checkedKey.value, checked.value);
}

async function copy() {
  const text = list.value.lines
    .filter((l) => !checked.value.includes(l.key))
    .map((l) => `• ${lineTitle(l)}${describeLine(l) ? ` — ${describeLine(l)}` : ''}`)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    alert('Список скопирован');
  } catch {
    prompt('Скопируйте список:', text);
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <PeriodBar />
    <div class="card flex flex-col gap-2.5">
      <label class="flex items-center gap-2.5">
        <span class="hint">Сколько человек</span>
        <input v-model.number="people" type="number" min="1" placeholder="1" class="w-[150px]" />
      </label>
      <p class="hint">Для рецептов считается доля на вашу порцию: 50 г от блюда весом 350 г — это 1/7 ингредиентов.</p>
    </div>

    <p v-if="!list.lines.length" class="py-6 text-center text-muted">На выбранный период блюда не выбраны.</p>
    <div v-else class="card">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold">Купить: {{ left }} из {{ list.lines.length }}</h3>
        <button class="link" @click="copy">Скопировать</button>
      </div>
      <ul class="mt-2">
        <li v-for="l in list.lines" :key="l.key" class="border-b border-line py-2 last:border-b-0">
          <label class="flex cursor-pointer items-center gap-2" :class="{ 'line-through opacity-50': checked.includes(l.key) }">
            <input type="checkbox" :checked="checked.includes(l.key)" @change="toggle(l.key)" />
            <span class="flex-1">
              {{ l.name }}
              <span class="hint">
                ·
                <template v-for="(d, i) in l.dishes" :key="d.title">
                  <template v-if="i">, </template>
                  <RouterLink
                    v-if="d.recipe"
                    :to="{ name: 'recipe', params: { id: d.recipe } }"
                    class="text-accent underline underline-offset-2"
                    @click.stop
                    >{{ d.title }}</RouterLink
                  >
                  <template v-else>{{ d.title }}</template>
                </template>
              </span>
              <span v-if="l.items" class="mt-0.5 block text-[14px]">{{ l.items.join(', ') }}</span>
            </span>
            <b>{{ describeLine(l) }}</b>
          </label>
        </li>
      </ul>
    </div>
    <p v-if="list.noIngredients.length" class="text-[13px] text-warn">
      Нет ингредиентов в рецептах: {{ list.noIngredients.join(', ') }}
    </p>
    <p v-if="list.wholeRecipe.length" class="text-[13px] text-warn">
      Посчитаны целиком, потому что не указан вес готового блюда: {{ list.wholeRecipe.join(', ') }}
    </p>
  </section>
</template>
