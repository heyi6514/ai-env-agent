/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TIAN_DI_TU_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
