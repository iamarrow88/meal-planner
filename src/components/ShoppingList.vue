<template>
  <div>
    <h2>Список покупок</h2>
    <table>
      <thead>
      <tr>
        <th>Продукт</th>
        <th>Количество</th>
        <th>Где нужен</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="item in items" :key="item.product + item.unit">
        <td>{{ item.product }}</td>
        <td>{{ item.quantity }} {{ item.unit }}</td>
        <td>{{ item.usage }}</td>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({ items: Array });
</script>