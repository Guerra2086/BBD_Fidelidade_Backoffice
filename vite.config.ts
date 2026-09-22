/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    // O <TopNav> (com os testes de submenu único) foi substituído pela sidebar desta
    // referência — sem suite de testes própria ainda. Evita que `npm run test` falhe
    // por não haver nenhum ficheiro *.test.tsx no momento.
    passWithNoTests: true,
  },
})
