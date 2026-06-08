import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import RoomView from '../views/RoomView.vue';

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/room/:roomId', name: 'room', component: RoomView, props: true },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
