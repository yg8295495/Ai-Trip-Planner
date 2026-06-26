import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(autoAnimatePlugin)
app.mount('#app')
