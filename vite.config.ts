import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: the repo is served at /museum-wars/, so the base
// path must match for assets to resolve. The live URL is then the
// repo URL: https://<user>.github.io/museum-wars/
export default defineConfig({
  plugins: [react()],
  base: '/museum-wars/',
})
