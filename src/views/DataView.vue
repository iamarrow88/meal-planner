<script setup lang="ts">
import { ref } from 'vue';
import ImportCard from '@/components/ImportCard.vue';
import SyncCard from '@/components/SyncCard.vue';
import { exportAll, importAll, type Backup } from '@/lib/db';

const fileInput = ref<HTMLInputElement>();
const message = ref('');

async function download() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `munch-mood-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function restore(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()) as Backup;
    if (!Array.isArray(data.recipes)) throw new Error('это не файл резервной копии');
    if (!confirm('Заменить все текущие данные данными из файла?')) return;
    await importAll(data);
    message.value = `Восстановлено: рецептов ${data.recipes.length}, сетов ${data.sets?.length ?? 0}, дней ${data.days?.length ?? 0}`;
  } catch (err) {
    message.value = `Ошибка: ${(err as Error).message}`;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <ImportCard />
    <SyncCard />
    <div class="card">
      <h3 class="mb-1.5 font-semibold">Резервная копия</h3>
      <p class="hint mb-3">
        Файл со всеми рецептами, сетами и меню — на всякий случай или для переноса без синхронизации. Восстановление
        заменяет текущие данные (и на других устройствах, если включена синхронизация).
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" @click="download">Скачать копию</button>
        <button class="btn-secondary" @click="fileInput?.click()">Восстановить из файла</button>
      </div>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="restore" />
      <p v-if="message" class="mt-2 text-[13px]">{{ message }}</p>
    </div>
  </section>
</template>
