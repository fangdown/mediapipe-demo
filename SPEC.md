# 虚拟背景 - Virtual Background

## 1. 项目概述

- **项目名称**: Virtual Background Demo
- **项目类型**: Vue 3 + Vite 单页应用
- **核心功能**: 使用 MediaPipe Selfie Segmentation 实现实时人像分割与虚拟背景替换
- **目标用户**: 需要视频会议背景替换的用户

## 2. 技术栈

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **样式**: SCSS
- **核心库**:
  - `@mediapipe/selfie_segmentation` - 人像分割
  - `@mediapipe/face_mesh` - 面部特征点检测（用于腮红效果）
  - `@mediapipe/drawing_utils` - 绘制工具
  - `@mediapipe/control_utils` - 控制面板

## 3. 功能列表

### 核心功能
1. **摄像头开关** - 独立控制摄像头开启/关闭
2. **摄像头采集** - 使用原生 `navigator.mediaDevices.getUserMedia` 获取视频流
3. **人像分割** - MediaPipe Selfie Segmentation 实时识别人物轮廓
4. **背景替换** - 将识别出的人物叠加到自定义背景上
5. **背景选择器** - 提供预设背景图片供用户选择
6. **腮红效果** - MediaPipe FaceMesh 检测面部特征点，在脸颊区域叠加自然红晕
7. **腮红强度控制** - 滑块调节腮红强度（10-100）

### 背景选项
- 原图（无背景替换）
- 预设背景 1: 渐变紫蓝色
- 预设背景 2: 渐变暖阳色
- 预设背景 3: 渐变极光色
- 预设背景 4: 渐变森林色
- 预设背景 5-8: 图片背景（办公室、城市夜景、自然风光、咖啡厅）

**背景数据结构**:
- 渐变背景: `{ id, name, preview (CSS gradient), colors: [color1, color2] }`
- 图片背景: `{ id, name, url (Unsplash URL), type: 'image', preview (同 url) }`

## 4. UI/UX 设计方向

### 视觉风格
- 现代简约风格，深色主题
- 毛玻璃效果 (Glassmorphism)
- 圆角卡片设计

### 交互状态
- **初始状态**: 仅显示文字提示"点击开启摄像头"，无加载动画
- **初始化中**: 显示 spinner 加载动画 + "正在初始化摄像头..." 文字
- **运行中**: 实时视频画面 + 底部背景选择器 + 腮红开关
- **腮红开启时**: 显示强度滑块（10-100）
- **错误状态**: 红色错误提示 + 重试按钮

### 配色方案
- 主色: `#6366f1` (Indigo)
- 背景: `#0f172a` (Slate 900)
- 卡片背景: `rgba(30, 41, 59, 0.8)`
- 文字: `#f1f5f9` (Slate 100)

### 布局
- 居中视频预览区域
- 底部背景选择器横向滚动
- 简洁的操作提示

## 5. 文件结构

```
├── index.html
├── package.json
├── vite.config.js
├── SPEC.md
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── style.scss
│   └── components/
│       └── VirtualBackground.vue
└── public/
```

## 6. 性能优化

### 已实现的优化
1. **跳帧处理** - 每隔一帧才送 MediaPipe 处理（处理帧率约 30fps），非处理帧用缓存结果渲染
2. **降低摄像头分辨率** - 使用 640x480 分辨率（比 1280x720 减少 70% 像素量）
3. **轻量分割模型** - 使用 `modelSelection: 0`（general 模型）替代 landscape 模型
4. **Page Visibility API** - 页面不可见时暂停动画循环，节省资源
5. **MediaPipe 正确释放** - 关闭摄像头时调用 `selfieSegmentation.close()` 释放 WASM 资源
6. **摄像头流自动停止** - 组件卸载/摄像头关闭时自动停止所有媒体轨道
7. **背景图预缩放** - 背景图提前缩放至 640x360 并缓存，避免运行时缩放
8. **内存泄漏修复** - unmount 时清理：动画循环、MediaPipe、resizeTimeout、背景图片缓存、事件监听器
9. **结果缓存渲染** - `lastResult` 缓存最近一次分割结果，跳帧时直接渲染避免卡顿

### 实现原理
1. 使用原生 `navigator.mediaDevices.getUserMedia` 获取摄像头视频流
2. 通过 `requestAnimationFrame` 循环处理帧，实现跳帧控制
3. Selfie Segmentation 逐帧分析图像，输出人物 mask
4. Face Mesh 同时处理同一帧，输出 468 个面部特征点
5. 使用 Canvas 2D `globalCompositeOperation` 进行图像合成
6. 根据 mask 将人物叠加到背景上
7. 在人像上叠加腮红效果（多点 radial gradient + soft-light 混合）
8. 输出最终处理后的画面
