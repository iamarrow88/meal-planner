import { createRouter, createWebHashHistory } from 'vue-router';

// hash-история работает на любом статическом хостинге и в установленном PWA
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/menu' },
    { path: '/menu', name: 'menu', component: () => import('./views/PlannerView.vue') },
    { path: '/shopping', name: 'shopping', component: () => import('./views/ShoppingView.vue') },
    { path: '/sets', name: 'sets', component: () => import('./views/SetsView.vue') },
    { path: '/sets/:id', name: 'set', component: () => import('./views/SetView.vue'), props: true },
    { path: '/recipes', name: 'recipes', component: () => import('./views/RecipesView.vue') },
    { path: '/recipes/:id', name: 'recipe', component: () => import('./views/RecipeView.vue'), props: true },
    { path: '/data', name: 'data', component: () => import('./views/DataView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/menu' },
  ],
  // при возврате «назад» страница открывается там же, где её пролистали
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
