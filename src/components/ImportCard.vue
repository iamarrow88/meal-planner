<script setup lang="ts">
import { ref } from 'vue';
import { importFolder, type ImportCounts, type ImportReport } from '@/lib/importFolder';

const input = ref<HTMLInputElement>();
const busy = ref(false);
const error = ref('');
const report = ref<ImportReport | null>(null);

async function onPick(e: Event) {
  const el = e.target as HTMLInputElement;
  const files = [...(el.files ?? [])];
  el.value = '';
  if (!files.length) return;
  busy.value = true;
  error.value = '';
  report.value = null;
  try {
    report.value = await importFolder(files);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

const describe = (c: ImportCounts) =>
  `новых ${c.added}, обновлено ${c.updated}, без изменений ${c.unchanged}, удалено ${c.removed}`;
</script>

<template>
  <div class="card flex flex-col gap-2.5">
    <h3 class="font-semibold">Импорт из Obsidian</h3>
    <p class="hint">
      Выберите папку с подпапками «Рецепты», «Завтраки», «Обеды», «Ужины» и «Перекусы». Повторный импорт обновит всё по
      именам файлов, а то, чего больше нет в папке, удалит из приложения.
    </p>
    <button class="btn-primary self-start" :disabled="busy" @click="input?.click()">
      {{ busy ? 'Загружаю…' : 'Выбрать папку' }}
    </button>
    <input ref="input" type="file" webkitdirectory multiple hidden @change="onPick" />
    <p v-if="error" class="text-[13px] text-warn">{{ error }}</p>
    <div v-if="report" class="flex flex-col gap-1 text-[13px]">
      <div><b>Сеты:</b> {{ describe(report.sets) }}</div>
      <div><b>Рецепты:</b> {{ describe(report.recipes) }}</div>
      <div v-if="report.skipped" class="text-muted">Пропущено файлов вне этих папок: {{ report.skipped }}</div>
      <details v-if="report.warnings.length" open>
        <summary class="cursor-pointer text-warn">Стоит проверить: {{ report.warnings.length }}</summary>
        <ul class="mt-1 flex flex-col gap-1">
          <li v-for="(w, i) in report.warnings" :key="i"><b>{{ w.file }}:</b> {{ w.text }}</li>
        </ul>
      </details>
    </div>
  </div>
</template>
