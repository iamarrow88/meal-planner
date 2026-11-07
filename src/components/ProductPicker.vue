<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Product } from '@/lib/matching';

const props = defineProps<{ catalog: Product[]; selected: string[] }>();
const emit = defineEmits<{ change: [keys: string[]] }>();

const query = ref('');
const focused = ref(false);

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

// каждое слово запроса должно совпасть с началом какого-нибудь слова: «кур фил» → «Куриное филе»
const found = computed(() => {
  const words = norm(query.value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return props.catalog
    .filter((p) => !props.selected.includes(p.key))
    .filter((p) => {
      const name = norm(p.name).split(/[\s/,()-]+/);
      return words.every((w) => name.some((n) => n.startsWith(w)));
    })
    .slice(0, 8);
});

const names = computed(() => new Map(props.catalog.map((p) => [p.key, p.name])));

function add(key: string) {
  emit('change', [...props.selected, key]);
  query.value = '';
}

const remove = (key: string) => emit('change', props.selected.filter((k) => k !== key));
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="relative">
      <input
        v-model="query"
        type="search"
        class="w-full"
        placeholder="Что есть дома: творог, курица…"
        aria-label="Найти продукт"
        @focus="focused = true"
        @blur="focused = false"
        @keydown.enter.prevent="found[0] && add(found[0].key)"
      />
      <!-- mousedown, а не click: иначе поле теряет фокус и список закрывается раньше, чем сработает выбор -->
      <ul
        v-if="focused && found.length"
        class="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
      >
        <li v-for="p in found" :key="p.key">
          <button class="w-full cursor-pointer px-3 py-2 text-left hover:bg-accent-soft" @mousedown.prevent="add(p.key)">
            {{ p.name }}
          </button>
        </li>
      </ul>
      <p v-else-if="focused && query.trim()" class="hint mt-1">Такого продукта нет в рецептах и сетах.</p>
    </div>
    <div v-if="selected.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="key in selected"
        :key="key"
        class="chip chip-on py-1 text-[14px]"
        :aria-label="`Убрать ${names.get(key) ?? key}`"
        @click="remove(key)"
      >
        {{ names.get(key) ?? key }} ×
      </button>
      <button class="link text-[13px]" @click="emit('change', [])">Убрать все</button>
    </div>
  </div>
</template>
