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
    meta: { requiresAuth: true },
  },
  {
    path: '/room/:roomId',
    name: 'room',
    component: RoomView,
    props: true,
    meta: { requiresAuth: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Bouncer: if a guarded route is hit while the user has no session,
 * send them to `/?next=<target>` so HomeView can resume the original
 * destination once they sign in. Routes opt in via `meta.requiresAuth`.
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
