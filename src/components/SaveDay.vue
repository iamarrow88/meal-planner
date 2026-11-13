<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDay } from '@/lib/dates';
import type { DayPlan } from '@/lib/types';
import { useMenusStore } from '@/stores/menus';

/**
 * Форма «Сохранить день» под заголовком карточки дня: этот день сохраняется отдельным дневным меню.
 * Открывается кнопкой в заголовке (`open`), закрывается событием `close`.
 */
const props = defineProps<{ day: DayPlan; open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = useMenusStore();

const name = ref('');
const saved = ref('');

const defaultName = () => `День ${formatDay(props.day.date).replace(/^[^,]*,\s*/, '')}`;

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = defaultName();
    saved.value = '';
  },
  { immediate: true },
);

async function save() {
  const title = name.value.trim() || defaultName();
  if (store.byName(title) && !confirm(`Меню «${title}» уже есть. Заменить его?`)) return;
  await store.saveMenu(title, [props.day]);
  saved.value = title;
  emit('close');
}
</script>

<template>
  <form v-if="open" class="mt-2 flex flex-wrap items-center gap-2" @submit.prevent="save">
    <input v-model="name" type="text" maxlength="80" class="min-w-0 flex-1" aria-label="Название меню" />
    <button type="submit" class="btn btn-primary">Сохранить</button>
    <button type="button" class="btn btn-secondary" @click="emit('close')">Отмена</button>
  </form>
  <p v-else-if="saved" class="hint mt-1">Сохранено как «{{ saved }}» — оно в «Мои меню» и на главной.</p>
</template>
