import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user.js';
import HomeView from '../views/HomeView.vue';
import PreJoinView from '../views/PreJoinView.vue';
import RoomView from '../views/RoomView.vue';

const routes = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/prejoin/:roomId',
    name: 'prejoin',
    component: PreJoinView,
    props: true,
  },
  {
    path: '/room/:roomId',
    name: 'room',
    component: RoomView,
    props: true,
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Bouncer: routes opt in via `meta.requiresAuth`. Pre-join and room are
 * intentionally public: anyone with a room code can join. Routes that
 * still need an authenticated user (e.g. an admin panel) set
 * `meta.requiresAuth: true` and are redirected to `/?next=<target>`.
 */
router.beforeEach((to) => {
  if (!to.meta?.requiresAuth) return true;
  const user = useUserStore();
  if (user.isAuthenticated) return true;
  return {
    name: 'home',
    query: { next: to.fullPath },
  };
});

export default router;
