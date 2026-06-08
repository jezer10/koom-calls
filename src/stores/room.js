import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useRoomStore = defineStore('room', () => {
  const roomId = ref(null);
  const peers = ref([]);

  function setRoom(id) {
    roomId.value = id;
  }
  function setPeers(next) {
    peers.value = next;
  }
  function clear() {
    roomId.value = null;
    peers.value = [];
  }
  return { roomId, peers, setRoom, setPeers, clear };
});
