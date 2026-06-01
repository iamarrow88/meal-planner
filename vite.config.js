import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createHtmlPlugin } from 'vite-plugin-html'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
      vue(),
    vueDevTools(),
    createHtmlPlugin({}),
    createHtmlPlugin({})
  ],
  /*base: {
    base: '/meal-planner/',
  }*/
})
