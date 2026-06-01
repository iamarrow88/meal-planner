<template>
  <div class="row">
    <label>Фильтр:</label>
    <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
    </select>
  </div>
</template>

<script setup>
defineProps({ tags: Array, modelValue: String });
defineEmits(['update:modelValue']);
</script>