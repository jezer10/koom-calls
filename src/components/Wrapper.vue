<template>
  <div class="main__container h-5/6 w-full bg-gray-100 p-5">
    <div class="main__title w-full h-1/6 flex justify-center items-center">
      <h1 class="text-5xl font-bold">Welcome to Koom CALLS!</h1>
    </div>
    <div class="main__options w-full h-5/6 flex flex-col justify-center  p-10 space-y-24">
        <button class="bg-red-900 text-white rounded-full py-4 text-2xl font-bold hover:bg-opacity-80 focus:ring-4 focus:ring-purple-900" @click="$emit('openwindow', $event)">JOIN ROOM</button>
        <button class="bg-red-900 text-white rounded-full py-4 text-2xl font-bold hover:bg-opacity-80 focus:ring-4 focus:ring-purple-900">CREATE NEW ROOM</button>
    </div>
  </div>
</template>

<script>
export default {};
</script>


<style scoped>
</style>