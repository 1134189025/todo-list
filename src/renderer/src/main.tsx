import { createRoot } from 'react-dom/client'
import '@fontsource/zcool-xiaowei/chinese-simplified-400.css'
import './styles/tokens.css'
import './styles/global.css'
import { App } from './App'
import { FloatApp } from './float/FloatApp'

const container = document.getElementById('root')
if (container === null) throw new Error('缺少挂载节点 #root')

// 同一份页面：主进程用 #float 打开悬浮窗。
const isFloat = window.location.hash === '#float'
if (isFloat) document.title = '清新待办 · 悬浮窗'

createRoot(container).render(isFloat ? <FloatApp /> : <App />)
