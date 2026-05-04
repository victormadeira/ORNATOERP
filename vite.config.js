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
                    // three.js + todos os satélites e deps internas do @react-three/fiber
                    // — ~2MB raw. Incluir as deps do fiber (react-reconciler, its-fine,
                    // react-use-measure, suspend-react) evita chunk circular
                    // vendor-misc ↔ vendor-three.
                    if (id.match(/node_modules[\\/](three|three-[\w-]+|troika-three-[\w-]+|@react-three|camera-controls|maath|meshline|stats-gl|react-reconciler|react-use-measure|its-fine|suspend-react)[\\/]/)) {
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
                    // Tudo o mais: rollup decide (split automático por rota).
                    // NÃO agrupar em vendor-misc — várias deps transitivas de
                    // @react-three/drei importam three e causariam chunk circular
                    // (@react-spring/*, @monogrid/gainmap-js, troika-worker-utils etc).
                    return undefined;
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
            '/docs/plugin': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
