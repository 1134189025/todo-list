import type { QingxinApi } from '@shared/api'

declare global {
  interface Window {
    api: QingxinApi
  }
}

export {}
