<template>
  <div>
    <h2>Блюда</h2>
    <div class="cards">
      <article v-for="meal in meals" :key="meal.id" class="meal-card">
        <h3>{{ meal.name }}</h3>
        <p>{{ meal.description }}</p>
        <div class="tags">
          <span v-for="tag in meal.tags" :key="tag" class="tag">{{ transcriptTagToRu(tag) }}</span>
        </div>
        <ul>
          <li v-for="i in meal.ingredients" :key="i.product">
            {{ i.product }}: {{ i.quantity }} {{ i.unit }}
          </li>
        </ul>
        <div class="row">
          <button @click="$emit('edit', meal)">Сохранить изменения</button>
          <button @click="$emit('delete', meal.id)">Удалить</button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import {transcriptTagToRu} from "../utils/format.js";

defineProps({ meals: Array });
defineEmits(['edit', 'delete']);
</script>