<template>
  <div class="app">
    <header class="header">
      <h1>虚拟背景</h1>
      <p class="subtitle">使用 MediaPipe 实现实时人像分割与背景替换</p>
    </header>

    <main class="main">
      <VirtualBackground />
    </main>
  </div>
</template>

<script setup>
import VirtualBackground from './components/VirtualBackground.vue'
</script>

<style lang="scss" scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}

.header {
  text-align: center;
  padding: 2rem 1rem;

  h1 {
    font-size: 2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #6366f1, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    margin-top: 0.5rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }
}

.main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 1rem 2rem;
}
</style>
