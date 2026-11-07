import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { useSyncStore } from './stores/sync';
import './style.css';

const app = createApp(App).use(createPinia()).use(router);
useSyncStore().init();
app.mount('#app');
