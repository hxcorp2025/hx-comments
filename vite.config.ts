import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// SHA do commit no CI; local cai pra 'dev'. O mesmo valor vai pro bundle e pro version.json,
// e é a comparação dos dois que detecta build velha presa no cache do Pages.
const BUILD = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)

export default defineConfig({
  // custom domain (central.hx-corp.com) serve na RAIZ — base de subpath quebraria os assets
  base: '/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    {
      name: 'escrever-version-json',
      closeBundle() {
        writeFileSync(resolve('dist/version.json'), JSON.stringify({ build: BUILD }))
      },
    },
  ],
})
