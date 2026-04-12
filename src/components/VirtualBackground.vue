<template>
  <div class="virtual-background">
    <div class="video-container">
      <video ref="videoElement" class="video" autoplay playsinline muted></video>
      <canvas ref="canvasElement" class="canvas"></canvas>

      <div v-if="!cameraEnabled && !isInitializing" class="hint">
        <p>点击开启摄像头</p>
      </div>

      <div v-if="isInitializing" class="loading">
        <div class="spinner"></div>
        <p>正在初始化摄像头...</p>
      </div>

      <div v-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="toggleCamera">{{ cameraEnabled ? '关闭' : '开启' }}摄像头</button>
      </div>
    </div>

    <div class="controls">
      <div class="camera-toggle">
        <button
          class="toggle-btn"
          :class="{ active: cameraEnabled }"
          @click="toggleCamera"
        >
          <span class="toggle-icon">{{ cameraEnabled ? '⏸' : '▶' }}</span>
          <span>{{ cameraEnabled ? '关闭' : '开启' }}摄像头</span>
        </button>

        <button
          class="toggle-btn blush-btn"
          :class="{ active: blushEnabled }"
          @click="blushEnabled = !blushEnabled"
        >
          <span>腮红 {{ blushEnabled ? 'ON' : 'OFF' }}</span>
        </button>

        <div v-if="blushEnabled" class="blush-intensity">
          <input
            type="range"
            min="10"
            max="100"
            v-model="blushIntensity"
            class="intensity-slider"
          />
        </div>
      </div>

      <div class="background-selector">
        <button
          v-for="bg in backgrounds"
          :key="bg.id"
          class="bg-option"
          :class="{ active: selectedBg === bg.id }"
          @click="selectBackground(bg.id)"
        >
          <div class="bg-preview" :style="bg.type === 'image' ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover' } : { background: bg.preview }"></div>
          <span class="bg-name">{{ bg.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
import { FaceMesh } from '@mediapipe/face_mesh'

const videoElement = ref(null)
const canvasElement = ref(null)
const isInitialized = ref(false)
const isInitializing = ref(false)
const cameraEnabled = ref(false)
const error = ref(null)
const selectedBg = ref('none')

let stream = null
let animationId = null
let selfieSegmentation = null
let isPageVisible = true
let frameCount = 0
let lastResult = null // Cache last result for frame skipping
let lastCanvasTime = 0
const FRAME_SKIP_INTERVAL = 1 // Process every 2nd frame
let faceMesh = null
let faceLandmarks = null // Cache last face landmarks for blush
const blushEnabled = ref(false)
const blushIntensity = ref(60) // 0-100

const backgrounds = [
  { id: 'none', name: '原图', preview: 'linear-gradient(135deg, #374151, #4b5563)' },
  { id: 'gradient1', name: '渐变紫蓝', preview: 'linear-gradient(135deg, #667eea, #764ba2)', colors: ['#667eea', '#764ba2'] },
  { id: 'gradient2', name: '暖阳', preview: 'linear-gradient(135deg, #f093fb, #f5576c)', colors: ['#f093fb', '#f5576c'] },
  { id: 'gradient3', name: '极光', preview: 'linear-gradient(135deg, #4facfe, #00f2fe)', colors: ['#4facfe', '#00f2fe'] },
  { id: 'gradient4', name: '森林', preview: 'linear-gradient(135deg, #11998e, #38ef7d)', colors: ['#11998e', '#38ef7d'] },
  { id: 'image1', name: '办公室', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=640&h=360&fit=crop', type: 'image' },
  { id: 'image2', name: '城市夜景', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=640&h=360&fit=crop', type: 'image' },
  { id: 'image3', name: '自然风光', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&h=360&fit=crop', type: 'image' },
  { id: 'image4', name: '咖啡厅', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=640&h=360&fit=crop', type: 'image' },
]

// Pre-scaled background images for canvas
const backgroundImages = {}

const preloadImage = (bg) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Create an offscreen canvas to pre-scale the image
      const offscreen = document.createElement('canvas')
      offscreen.width = 640
      offscreen.height = 360
      const offCtx = offscreen.getContext('2d')
      offCtx.drawImage(img, 0, 0, 640, 360)
      backgroundImages[bg.id] = offscreen
      resolve()
    }
    img.onerror = () => {
      // Still resolve on error so Promise.all doesn't hang
      resolve()
    }
    img.src = bg.url
  })
}

const preloadImages = async () => {
  const imageBackgrounds = backgrounds.filter(bg => bg.type === 'image')
  await Promise.all(imageBackgrounds.map(preloadImage))
}

const disposeMediaPipe = () => {
  if (selfieSegmentation) {
    try {
      selfieSegmentation.close()
    } catch (e) {
      console.warn('MediaPipe close error:', e)
    }
    selfieSegmentation = null
  }
}

const disposeFaceMesh = () => {
  if (faceMesh) {
    try {
      faceMesh.close()
    } catch (e) {
      console.warn('FaceMesh close error:', e)
    }
    faceMesh = null
  }
}

const initFaceMesh = async () => {
  disposeFaceMesh()

  try {
    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    })

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true
    })

    faceMesh.onResults(onFaceMeshResults)
    await faceMesh.initialize()
  } catch (e) {
    console.warn('FaceMesh init error:', e)
  }
}

const onFaceMeshResults = (results) => {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    faceLandmarks = results.multiFaceLandmarks[0]
  }
}

const initMediaPipe = async () => {
  // Dispose existing instance first
  disposeMediaPipe()

  try {
    selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    })

selfieSegmentation.setOptions({
      modelSelection: 0, // 0 = general model (faster), 1 = landscape model
      selfieMode: false
    })

    selfieSegmentation.onResults(onResults)
    await selfieSegmentation.initialize()
  } catch (e) {
    error.value = 'MediaPipe 初始化失败: ' + e.message
    console.error(e)
  }
}

const drawBackground = (ctx, width, height) => {
  const bg = backgrounds.find(b => b.id === selectedBg.value)

  if (bg?.type === 'image') {
    const img = backgroundImages[bg.id]
    if (img && img.width > 0) {
      // Object-fit: cover logic - scale to cover the canvas while maintaining aspect ratio
      const imgAspect = img.width / img.height
      const canvasAspect = width / height

      let drawWidth, drawHeight, drawX, drawY

      if (canvasAspect > imgAspect) {
        // Canvas is wider than image - fit height, add letterboxing on sides
        drawHeight = height
        drawWidth = height * imgAspect
        drawX = (width - drawWidth) / 2
        drawY = 0
      } else {
        // Canvas is taller than image - fit width, add letterboxing top/bottom
        drawWidth = width
        drawHeight = width / imgAspect
        drawX = 0
        drawY = (height - drawHeight) / 2
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
    }
  } else if (bg?.colors) {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, bg.colors[0])
    gradient.addColorStop(1, bg.colors[1])
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }
}

const drawBlush = (ctx, landmarks, width, height) => {
  if (!blushEnabled.value || !landmarks) return

  // Left cheek landmarks 187, 123; right cheek landmarks 411, 347
  const leftCheekPoints = [landmarks[187], landmarks[123], landmarks[50]]
  const rightCheekPoints = [landmarks[411], landmarks[347], landmarks[280]]

  const scale = blushIntensity.value / 100

  // Helper to draw blush over multiple points for broader coverage
  const drawCheekBlush = (points) => {
    if (!points.every(p => p)) return

    // Draw multiple overlapping gradients for natural spread
    points.forEach((point, i) => {
      const cx = point.x * width
      const cy = point.y * height
      // Vary size based on which point
      const radius = Math.min(width, height) * (0.04 + i * 0.015)

      // More red, natural blush color
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      gradient.addColorStop(0, `rgba(255, 100, 100, ${0.35 * scale})`)
      gradient.addColorStop(0.5, `rgba(255, 120, 120, ${0.2 * scale})`)
      gradient.addColorStop(1, 'rgba(255, 130, 130, 0)')

      // Use soft-light for more natural color blending
      ctx.globalCompositeOperation = 'soft-light'
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius * 1.2, radius * 0.8, 0, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  drawCheekBlush(leftCheekPoints)
  drawCheekBlush(rightCheekPoints)
}

const onResults = (results) => {
  // Cache result for frame skipping
  lastResult = results
  renderFrame(results)
}

const renderFrame = (results) => {
  const canvas = canvasElement.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')

  canvas.width = videoElement.value.videoWidth
  canvas.height = videoElement.value.videoHeight

  ctx.save()

  if (selectedBg.value === 'none') {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height)

    ctx.globalCompositeOperation = 'source-out'
    drawBackground(ctx, canvas.width, canvas.height)

    ctx.globalCompositeOperation = 'destination-atop'
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
  }

  // Draw blush effect on top of the person
  if (faceLandmarks) {
    drawBlush(ctx, faceLandmarks, canvas.width, canvas.height)
  }

  ctx.restore()
}

const processFrame = async () => {
  // Stop the loop if camera is disabled or page is hidden
  if (!cameraEnabled.value || !isPageVisible) {
    animationId = null
    return
  }

  if (selfieSegmentation && videoElement.value && videoElement.value.readyState >= 2) {
    frameCount++

    // Skip every other frame to reduce GPU/CPU load
    if (frameCount % (FRAME_SKIP_INTERVAL + 1) === 0) {
      // Use cached result to render this frame
      if (lastResult && canvasElement.value) {
        renderFrame(lastResult)
      }
    } else {
      // Send frame to MediaPipe for processing
      await selfieSegmentation.send({ image: videoElement.value })
      // Also send to FaceMesh for facial landmarks
      if (faceMesh) {
        await faceMesh.send({ image: videoElement.value })
      }
    }
  }

  // Only continue if camera is still enabled
  if (cameraEnabled.value) {
    animationId = requestAnimationFrame(processFrame)
  }
}

const toggleCamera = async () => {
  error.value = null

  if (cameraEnabled.value) {
    // Stop animation loop first
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }

    // Dispose MediaPipe before stopping stream
    disposeMediaPipe()
    disposeFaceMesh()
    faceLandmarks = null

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }

    // Clear video and canvas
    if (videoElement.value) {
      videoElement.value.srcObject = null
    }
    if (canvasElement.value) {
      const c = canvasElement.value.getContext('2d')
      c.clearRect(0, 0, canvasElement.value.width, canvasElement.value.height)
    }

    cameraEnabled.value = false
    isInitialized.value = false
    frameCount = 0
    lastResult = null
    return
  }

  // Start camera
  isInitializing.value = true

  if (!videoElement.value || !canvasElement.value) {
    error.value = '组件未正确初始化'
    isInitializing.value = false
    return
  }

  try {
    await initMediaPipe()
    await initFaceMesh()

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      }
    })

    videoElement.value.srcObject = stream
    await videoElement.value.play()

    cameraEnabled.value = true
    isInitializing.value = false
    isInitialized.value = true
    frameCount = 0
    lastResult = null

    animationId = requestAnimationFrame(processFrame)
  } catch (e) {
    error.value = '摄像头访问失败，请确保已授权摄像头权限'
    console.error(e)
    isInitializing.value = false
  }
}

const selectBackground = (bgId) => {
  selectedBg.value = bgId
}

const handleVisibilityChange = () => {
  isPageVisible = !document.hidden
}

// Throttle resize events
let resizeTimeout = null
const handleResize = () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    resizeTimeout = null
  }, 250)
}

onMounted(async () => {
  await preloadImages()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  // Stop animation loop first
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }

  // Stop camera and release MediaStream tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }

  // Dispose MediaPipe to release WASM resources
  disposeMediaPipe()

  // Clear resize timeout
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
    resizeTimeout = null
  }

  // Clear background image cache
  for (const key in backgroundImages) {
    delete backgroundImages[key]
  }

  // Clear frame cache
  frameCount = 0
  lastResult = null

  // Dispose FaceMesh
  disposeFaceMesh()
  faceLandmarks = null

  // Remove event listeners
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.virtual-background {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 900px;
}

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #1e293b;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
}

.canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loading,
.error,
.hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #94a3b8;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #334155;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  p {
    margin-bottom: 1rem;
    color: #f87171;
  }

  button {
    padding: 0.5rem 1.5rem;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: #4f46e5;
    }
  }
}

.controls {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 1rem;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.camera-toggle {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: #475569;
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;

  &:hover {
    background: #64748b;
  }

  &.active {
    background: #ef4444;

    &:hover {
      background: #dc2626;
    }
  }
}

.toggle-icon {
  font-size: 0.9rem;
}

.blush-btn {
  &.active {
    background: #ec4899;

    &:hover {
      background: #db2777;
    }
  }
}

.blush-intensity {
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
}

.intensity-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  background: #475569;
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: #ec4899;
    border-radius: 50%;
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #ec4899;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }
}

.background-selector {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 3px;
  }
}

.bg-option {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(99, 102, 241, 0.1);
  }

  &.active {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.2);
  }
}

.bg-preview {
  width: 60px;
  height: 40px;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.bg-name {
  font-size: 0.75rem;
  color: #94a3b8;
}

.bg-option.active .bg-name {
  color: #f1f5f9;
}
</style>
