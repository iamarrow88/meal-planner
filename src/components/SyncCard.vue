<script setup lang="ts">
import { ref } from 'vue';
import { useSyncStore } from '@/stores/sync';

const sync = useSyncStore();
const email = ref('');
const password = ref('');
const busy = ref(false);
const message = ref('');

async function run(action: () => Promise<void>) {
  busy.value = true;
  message.value = '';
  try {
    await action();
  } catch (e) {
    message.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const signIn = () => run(() => sync.signIn(email.value, password.value));

const signUp = () =>
  run(async () => {
    const needsConfirm = await sync.signUp(email.value, password.value);
    if (needsConfirm) message.value = 'Мы отправили письмо — подтвердите почту по ссылке, затем войдите.';
  });
</script>

<template>
  <div v-if="!sync.configured" class="card">
    <h3 class="mb-1.5 font-semibold">Синхронизация</h3>
    <p class="hint">
      Не настроена. Создайте проект в Supabase и укажите его адрес и ключ в файле <code>.env.local</code> — инструкция в
      README.
    </p>
  </div>

  <div v-else-if="sync.user" class="card flex flex-col gap-2.5">
    <h3 class="font-semibold">Синхронизация</h3>
    <div class="text-[13px]">
      Аккаунт: <b>{{ sync.user.email }}</b>
    </div>
    <div class="text-[13px]" :class="sync.state === 'error' ? 'text-warn' : 'text-muted'">{{ sync.statusText }}</div>
    <div class="flex flex-wrap gap-2">
      <button class="btn-secondary" :disabled="sync.state === 'syncing'" @click="sync.syncNow()">
        Синхронизировать сейчас
      </button>
      <button class="link" @click="run(sync.signOut)">Выйти</button>
    </div>
    <p class="hint">Данные остаются на устройстве и после выхода.</p>
  </div>

  <form v-else class="card flex flex-col gap-2.5" @submit.prevent="signIn">
    <h3 class="font-semibold">Синхронизация</h3>
    <p class="hint">Войдите в один аккаунт на всех устройствах — рецепты, сеты и меню будут одинаковыми.</p>
    <label class="flex flex-col gap-1">
      <span class="hint">Почта</span>
      <input v-model="email" type="email" autocomplete="email" required />
    </label>
    <label class="flex flex-col gap-1">
      <span class="hint">Пароль</span>
      <input v-model="password" type="password" autocomplete="current-password" required minlength="6" />
    </label>
    <div class="flex flex-wrap gap-2">
      <button class="btn-primary" type="submit" :disabled="busy">Войти</button>
      <button class="btn-secondary" type="button" :disabled="busy || !email || password.length < 6" @click="signUp">
        Зарегистрироваться
      </button>
    </div>
    <p v-if="message" class="text-[13px]">{{ message }}</p>
  </form>
</template>
