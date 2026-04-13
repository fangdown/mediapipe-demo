import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.NODE_ENV === 'production' ? '/mediapipe-demo/' : '/',
  server: {
    host: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      external: [
        '@mediapipe/selfie_segmentation',
        '@mediapipe/face_mesh',
        '@mediapipe/control_utils',
        '@mediapipe/drawing_utils'
      ]
    }
  }
})
