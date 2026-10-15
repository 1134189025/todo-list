import { createRoot } from 'react-dom/client'
import '@fontsource/zcool-xiaowei/chinese-simplified-400.css'
import './styles/tokens.css'
import './styles/global.css'
import { App } from './App'
import { FloatApp } from './float/FloatApp'
import { VoicePillApp } from './voice/VoicePillApp'

const container = document.getElementById('root')
if (container === null) throw new Error('缺少挂载节点 #root')

// 同一份页面：主进程用 #float 打开悬浮窗、用 #voice 打开语音胶囊。
const hash = window.location.hash
const isFloat = hash === '#float'
const isPill = hash === '#voice'
if (isFloat) document.title = '清新待办 · 悬浮窗'
if (isPill) {
  document.title = '清新待办 · 语音'
  // 胶囊窗口是透明的：这一页去掉页面底色，并按内容决定大小。
  document.documentElement.classList.add('pill-page')
}

createRoot(container).render(isFloat ? <FloatApp /> : isPill ? <VoicePillApp /> : <App />)
