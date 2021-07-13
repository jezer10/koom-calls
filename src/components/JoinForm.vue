<template>
    <div class="form_wrapper bg-red-900  bg-opacity-50 h-full w-full flex justify-center items-center">
        <div class="form_card bg-white w-1/6 rounded-sm shadow-lg p-6 space-y-2">
        <div class="form__close w-full flex justify-end">
            <button class=" w-2 focus:outline-black" @click="$emit('closewindow', $event)">
                <img class="w-full" src="../assets/close.svg" alt="closeicon">
            </button>
        </div>
        <div class="form__control w-full flex flex-col justify-center items-center ">
            <label class="text-xl font-bold" for="roomcode">ROOM CODE</label>
            <input class="w-full rounded-full shadow-sm text-center text-xl font-medium focus:outline-none border " type="text" id="roomcode" placeholder="XXX-XXX-XXX">
        </div>
        <div class="form__button w-full flex items-center justify-center">
            <button class="bg-red-900 text-white px-4 py-1">Join</button>
        </div>
        </div>
    </div>
</template>
<script>
export default {};
</script>
<style scoped>
</style>