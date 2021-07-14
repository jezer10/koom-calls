<template>
  <div class="doc__container h-screen w-screen bg-indigo-50">
    <div class="main_video_container w-full h-1/2 flex flex-col space-y-2">

      <div class="video__container p-5 w-full h-5/6 flex justify-center">
        <video class="video_media rounded-3xl bg-red-500  h-full w-full" ref="camera" >
        </video>
        
      </div>
      <div class="video__options w-full flex justify-center space-x-6">
        <button class="text-white rounded-full w-14 h-14" :class="{'bg-red-500':!onCamera,'bg-gray-600':onCamera}" @click="switchCamera"><i class ="fas" v-bind:class="{'fa-video':onCamera,'fa-video-slash':!onCamera}"></i></button>
        <button class="text-white rounded-full w-14 h-14" :class="{'bg-red-500':!onMicrophone,'bg-gray-600':onMicrophone}" @click="switchMicrophone"><i class ="fas" v-bind:class="{'fa-microphone':onMicrophone,'fa-microphone-slash':!onMicrophone}"></i></button>
      </div>
    </div>
  </div>
</template>

<script>
 import { io } from "socket.io-client";
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
      onCamera:false,
      onMicrophone:false
    };
  },
  methods: {
    startCamera(video) {
      const videoConstrains = {
        video: true,
        audio: true,
      };
      navigator.mediaDevices
        .getUserMedia(videoConstrains)
        .then((stream) => {
          video.srcObject = stream;
          video.muted=true
          video.play()
          this.onCamera=true
          
        })
        .catch((e) => {
          console.log(e);
        });
    },
    stopCamera(video){

      video.srcObject.getTracks().forEach(e => {
        if(e.kind==='video'){
          e.stop()
          video.srcObject=null
          this.onCamera=false
        }
      });

    },
    switchCamera(){
      const camera = this.$refs.camera
      if(camera.srcObject==null){
        this.startCamera(camera)
      }
      else{
        this.stopCamera(camera)

      }

    },
    showDevices(){
      navigator.mediaDevices.enumerateDevices().then(e =>console.log(e))
    },
    switchMicrophone(){
      console.log('hola')
    }

  },
  created(){
  }
};
</script>

<style scoped>
</style>