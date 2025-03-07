<template>
    <div class="app-container">
        <h1>plugin-pinia-persistence</h1>

        Count: {{ count }}
        <button @click="handleAdd"> + 1 查看持久化状态</button>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from './stores/user'

const userStore = useUserStore()
const count = computed(() => userStore.count)

const handleAdd = () => {
    userStore.setCount()
}
</script>
