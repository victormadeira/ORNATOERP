import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    root: fileURLToPath(new URL('./preview/quick-quote', import.meta.url)),
    plugins: [react()],
    build: {
        outDir: fileURLToPath(new URL('./dist-quick-quote', import.meta.url)),
        emptyOutDir: true,
    },
});
