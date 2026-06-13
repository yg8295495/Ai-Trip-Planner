interface ImportMetaEnv {
  // ⚠️ AMAP_KEY 目前硬编码在 services/ 多个文件中，未通过 env 注入
  // readonly VITE_AMAP_KEY: string
  readonly VITE_AI_PROVIDER: string
  readonly VITE_SESSIONS_DIR: string
  readonly VITE_POLL_INTERVAL: string
  readonly VITE_AI_TIMEOUT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
