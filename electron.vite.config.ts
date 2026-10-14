import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const sharedAlias = { '@shared': resolve('src/shared') }

// React 开发期会注入内联的 refresh preamble 脚本，计划里的 CSP 会拦截它。
// 只在 dev 服务时放宽 script-src，构建产物仍使用 index.html 里的原始 CSP。
function devRefreshPreambleCsp(): Plugin {
  return {
    name: 'qingxin-dev-refresh-preamble-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("default-src 'self'; ", "default-src 'self'; script-src 'self' 'unsafe-inline'; ")
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), devRefreshPreambleCsp()],
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve('src/renderer/src') }
    },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
