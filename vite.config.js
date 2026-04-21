import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        // 800 KB — acima disso ainda avisa, mas sem poluir sobre o PlanoCorte legacy.
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            output: {
                // Função de chunking fina — separa libs pesadas em bundles próprios
                // para que páginas que não usam uma lib não a paguem no download.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;

                    // React core — sempre primeiro request
                    if (id.match(/node_modules[\\/](react|react-dom|scheduler)[\\/]/)) {
                        return 'vendor-react';
                    }
                    // Ícones — compartilhado por quase tudo
                    if (id.includes('node_modules/lucide-react/')) {
                        return 'vendor-icons';
                    }
                    // three.js + extensões CSG — ~2MB raw, precisa estar isolado
                    if (id.match(/node_modules[\\/](three|three-bvh-csg|@react-three)[\\/]/)) {
                        return 'vendor-three';
                    }
                    // Scanner QR — pesado, só usado em QRScanModal/ScanPeca3D
                    if (id.includes('node_modules/html5-qrcode/')) {
                        return 'vendor-qrcode';
                    }
                    // Drag & drop — só usado em algumas telas (Kanbans, FunilLeads, etc.)
                    if (id.includes('node_modules/@dnd-kit/')) {
                        return 'vendor-dnd';
                    }
                    // DXF parser + G-code toolpath — usado em CNC
                    if (id.match(/node_modules[\\/](dxf-parser|gcode-toolpath)[\\/]/)) {
                        return 'vendor-cnc-parsers';
                    }
                    // Zustand — state global
                    if (id.includes('node_modules/zustand/')) {
                        return 'vendor-zustand';
                    }
                    // Tudo o mais de node_modules: vendor-misc
                    return 'vendor-misc';
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
