import { createRoot } from 'react-dom/client'
import '@fontsource/zcool-xiaowei/chinese-simplified-400.css'
import './styles/tokens.css'
import './styles/global.css'
import { App } from './App'

const container = document.getElementById('root')
if (container === null) throw new Error('缺少挂载节点 #root')

createRoot(container).render(<App />)
