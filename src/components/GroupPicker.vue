<script setup lang="ts">
import { computed } from 'vue';
import { halveLabel } from '@/lib/parseSet';
import type { SetGroup, SetOption } from '@/lib/types';

/** required — в меню: невыбранный вариант подсвечивается, иначе его продукты не попадут в покупки. */
const props = defineProps<{ group: SetGroup; picked: string[]; required?: boolean }>();
const emit = defineEmits<{ change: [picked: string[]] }>();

// вариант могли убрать из файла в Obsidian: такой выбор не считается
const valid = computed(() => props.picked.filter((id) => props.group.options.some((o) => o.id === id)));
const halved = computed(() => !!props.group.halves && valid.value.length === 2);

// второй список появляется после выбора первого
const slots = computed(() => (props.group.pick === 2 && valid.value.length && props.group.options.length > 1 ? [0, 1] : [0]));
const choices = (slot: number) =>
  props.group.options.filter((o) => o.id === valid.value[slot] || !valid.value.includes(o.id));

// варианты второго списка уже показаны с половинным весом: так видно, что будет после выбора
const optionLabel = (option: SetOption, slot: number) =>
  props.group.halves && (slot === 1 || halved.value) ? halveLabel(option.label) : option.label;

const placeholder = (slot: number) =>
  slot === 0 ? '— выберите —' : props.group.halves ? '+ второй вариант (вес пополам)' : '— выберите второй —';

const hint = computed(() =>
  props.group.halves
    ? 'Один вариант — полный вес, два — по половине'
    : props.group.pick === 2
      ? 'Два варианта на выбор'
      : '',
);

// «два варианта на выбор» ждёт оба, «по половине» и «один вариант» — один
const needed = computed(() => Math.min(props.group.pick === 2 && !props.group.halves ? 2 : 1, props.group.options.length));
const missing = (slot: number) => !!props.required && !valid.value[slot] && slot < needed.value;

const recipeLinks = computed(() =>
  valid.value
    .map((id) => props.group.options.find((o) => o.id === id)!)
    .filter((o) => o.recipe)
    .map((o) => ({ id: o.id, recipe: o.recipe!, label: halved.value ? halveLabel(o.label) : o.label })),
);

function pick(slot: number, e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const next = [...valid.value];
  if (id) next[slot] = id;
  else next.splice(slot, 1);
  emit('change', next);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <template v-if="group.pick === 0">
      <div class="flex flex-col gap-0.5">
        <span v-if="group.title !== group.options[0]?.label" class="font-medium">{{ group.title }}</span>
        <template v-for="option in group.options" :key="option.id">
          <RouterLink v-if="option.recipe" :to="{ name: 'recipe', params: { id: option.recipe } }" class="text-accent">
            {{ option.label }} ›
          </RouterLink>
          <span v-else>{{ option.label }}</span>
        </template>
      </div>
    </template>
    <template v-else>
      <span class="font-medium">{{ group.title }}</span>
      <p v-if="hint" class="hint">{{ hint }}</p>
      <select
        v-for="slot in slots"
        :key="slot"
        class="w-full"
        :class="{ 'border-warn ring-1 ring-warn': missing(slot) }"
        :value="valid[slot] ?? ''"
        :aria-label="group.title"
        @change="pick(slot, $event)"
      >
        <option value="">{{ placeholder(slot) }}</option>
        <option v-for="option in choices(slot)" :key="option.id" :value="option.id">
          {{ optionLabel(option, slot) }}
        </option>
      </select>
      <p v-if="slots.some(missing)" class="text-[13px] text-warn">Выберите вариант — без него продукты не попадут в покупки.</p>
      <RouterLink
        v-for="link in recipeLinks"
        :key="link.id"
        :to="{ name: 'recipe', params: { id: link.recipe } }"
        class="text-[13px] text-accent"
      >
        Рецепт: {{ link.label }} ›
      </RouterLink>
    </template>
    <p v-if="group.note" class="hint">{{ group.note }}</p>
  </div>
</template>
