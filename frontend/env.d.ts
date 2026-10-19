/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_PROXY_TARGET?: string
  readonly VITE_TOKEN_PREFIX?: string
  readonly VITE_SYSTEM_PARAM_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
