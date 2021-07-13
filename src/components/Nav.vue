<template>
  <div class="nav_container h-1/6 bg-red-900  w-full flex items-center justify-between px-4">
    <div class="nav__logo">
      <h3 class="text-3xl font-bold text-white">KOOM</h3>
    </div>
    <div class="nav__options"></div>
    <div class="nav__user flex items-center space-x-4">
      <div class="user__profile h-10 w-10 bg-white rounded-full bg-contain bg-center"></div>
      <div class="user__name">
        <h4 class="font-extrabold text-white">Juan Gonzales</h4> 
      </div>
    </div>
  </div>
</template>

<script setup>

</script>

<style scoped>
.user__profile {
  background-image: url("../assets/logo.png");
}
</style>
