import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useRoomStore = defineStore('room', () => {
  // `roomId` is the human-shareable code (XXX-XXX-XXX) used for routing
  // and the user-facing UI. `callId` is the backend's internal UUID;
  // we keep it around so subsequent calls to the API (e.g. end, getCall)
  // don't have to look it up by roomId first.
  const roomId = ref(null);
  const callId = ref(null);
  const peers = ref([]);

  function setRoom(id) {
    roomId.value = id;
  }

  function setCall({ id, roomId: code }) {
    callId.value = id ?? null;
    if (code !== undefined) roomId.value = code;
  }

  function setPeers(next) {
    peers.value = next;
  }

  function clear() {
    roomId.value = null;
    callId.value = null;
    peers.value = [];
  }

  return {
    roomId,
    callId,
    peers,
    setRoom,
    setCall,
    setPeers,
    clear,
  };
});
