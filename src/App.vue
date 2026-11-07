<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSyncStore } from './stores/sync';

const sync = useSyncStore();
const route = useRoute();

// рецепт, открытый из меню, сета или покупок, оставляет подсвеченной вкладку, откуда пришли
const activeTab = computed(() => {
  const back = window.history.state?.back;
  const path = route.name === 'recipe' && typeof back === 'string' ? back : route.path;
  return tabs.find((t) => path.startsWith(t.to))?.to;
});

const tabs = [
  { to: '/menu', label: 'Меню', icon: '📅' },
  { to: '/shopping', label: 'Покупки', icon: '🛒' },
  { to: '/sets', label: 'Сеты', icon: '🍱' },
  { to: '/recipes', label: 'Рецепты', icon: '📖' },
  { to: '/data', label: 'Данные', icon: '💾' },
];
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="flex items-center justify-between border-b border-line bg-surface px-4 py-3 print:hidden">
      <h1 class="text-lg font-bold">Munch Mood</h1>
      <RouterLink
        v-if="sync.user"
        to="/data"
        :title="sync.statusText"
        class="text-lg"
        :class="sync.state === 'error' || sync.state === 'offline' ? 'text-warn' : 'text-accent'"
      >
        {{ sync.state === 'syncing' ? '⟳' : sync.state === 'idle' ? '☁' : '⚠' }}
      </RouterLink>
    </header>

    <main class="mx-auto w-full max-w-[820px] flex-1 px-4 pt-4 pb-24 print:max-w-none print:p-0">
      <RouterView />
    </main>

    <nav class="fixed inset-x-0 bottom-0 flex justify-center border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        class="flex max-w-[140px] flex-1 flex-col items-center gap-0.5 px-1 py-2 text-xs text-muted"
        :class="{ 'text-accent! font-semibold': activeTab === t.to }"
      >
        <span class="text-xl">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
