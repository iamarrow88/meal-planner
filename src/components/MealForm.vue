<template>
  <form class="card" @submit.prevent="save">
    <h2>{{ editingId ? 'Редактировать блюдо' : 'Новое блюдо' }}</h2>
    <input v-model="name" placeholder="Название" />
    <textarea v-model="description" placeholder="Описание"></textarea>
    <input v-model="tagsText" placeholder="Теги через запятую: обед, ужин" />
    <textarea v-model="ingredientsText" placeholder="Ингредиенты: продукт;кол-во;единица"></textarea>
    <button type="submit">Сохранить</button>
  </form>
</template>

<script setup>
import { ref } from 'vue';
import { db } from '../db';
import { transcriptTagToEng } from './../utils/format.js';

const emit = defineEmits(['saved']);

const editingId = ref('');
const name = ref('');
const description = ref('');
const tagsText = ref('');
const ingredientsText = ref('');

async function save() {
  const meal = {
    id: editingId.value || crypto.randomUUID(),
    name: name.value,
    description: description.value,
    tags: tagsText.value.split(',').map((s) => s.trim()).filter(Boolean).map((t) => transcriptTagToEng(t)),
    ingredients: ingredientsText.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [product, quantity, unit] = line.split(';').map((s) => s.trim());
          return { product, quantity: Number(quantity || 0), unit };
        }),
  };

  await db.meals.put(meal);
  name.value = '';
  description.value = '';
  tagsText.value = '';
  ingredientsText.value = '';
  editingId.value = '';
  emit('saved');
}
</script>