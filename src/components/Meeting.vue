<template>
  <div class="doc__container h-screen w-screen bg-indigo-50">
    <div class="main_video_container">
      <div class="video__title">
        <p>{{ hola }}</p>
      </div>
      <div class="video__container">
        <video class="video_media bg-red-900" ref="camera" autoplay></video>
      </div>
      <div class="video__options">
        <button class="bg-red-500 text-white" @click="startCamera">ON</button>
      </div>
    </div>
  </div>
</template>

<script>
// import { io } from "socket.io-client";
// import Peer from "peerjs";

// const socket = io("http://localhost:8080");

// const peer = new Peer(undefined,{
//     port:8080,
//     host:'/myapp/peerjs'
// })

export default {
  data() {
    return {
      hola: "title",
    };
  },
  methods: {
    startCamera() {
      const videoConstrains = {
        video: true,
        audio: true,
      };
      navigator.mediaDevices
        .getUserMedia(videoConstrains)
        .then((stream) => {
          this.$refs.camera.srcObject = stream;
        })
        .catch((e) => {
          console.log(e);
        });
    },
  },
};
</script>

<style scoped>
</style>