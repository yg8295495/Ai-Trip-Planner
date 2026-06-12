interface ImportMetaEnv {
  readonly VITE_AMAP_KEY: string
  readonly VITE_AI_PROVIDER: string
  readonly VITE_SESSIONS_DIR: string
  readonly VITE_POLL_INTERVAL: string
  readonly VITE_AI_TIMEOUT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
