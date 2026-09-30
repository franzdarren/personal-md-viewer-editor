import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Mermaid is big, but it is only downloaded when a document contains a diagram.
    chunkSizeWarningLimit: 3000,
  },
});
