<template >
  <div class="wrapper h-screen w-screen">
    <Nav></Nav>
    <Wrapper v-on:openwindow="isOpen=true"></Wrapper>
    <JoinForm v-if="isOpen" v-on:closewindow="isOpen=false" class="absolute top-0 right-0"></JoinForm>
  </div>
</template>


<script>
import Nav from "./Nav.vue";
import Wrapper from "./Wrapper.vue";
import JoinForm from "./JoinForm.vue";
export default {
  components: {Nav, Wrapper,JoinForm},
  data(){
      return {
          isOpen:false
      }
  },
  methods:{

  },
  created(){
      console.log(this.isOpen)
  }
}
</script>

<style scoped>
</style>