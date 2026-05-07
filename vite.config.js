import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // Garante instância única de React mesmo quando deps transitivas
        // (react-reconciler, its-fine, etc.) importam React separadamente.
        dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
        // PROBLEMA: o esbuild do Vite 6 bundla react/cjs/react.development.js
        // INLINE dentro do chunk compartilhado de @react-three/fiber (via
        // react-reconciler que usa require('react') CJS). Isso cria uma 2ª
        // instância de React isolada — causa "Cannot read properties of null
        // (reading 'useState')" porque ReactCurrentDispatcher.current aponta para
        // o dispatcher da instância errada.
        //
        // SOLUÇÃO: excluir fiber e drei do pré-bundling. O Vite os serve via
        // transformação CJS→ESM on-demand, que respeita resolve.dedupe e redireciona
        // todos os require('react') para o mesmo react.js pré-bundlado.
        // Em produção (Rollup) isso não tem efeito — o manualChunks cuida.
        exclude: ['@react-three/fiber', '@react-three/drei'],
    },
    build: {
        // 800 KB — acima disso ainda avisa, mas sem poluir sobre o PlanoCorte legacy.
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            output: {
                // Função de chunking fina — separa libs pesadas em bundles próprios
                // para que páginas que não usam uma lib não a paguem no download.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;

                    // React core + todo ecossistema que usa hooks internamente.
                    // CRÍTICO: react-reconciler, its-fine, suspend-react e react-use-measure
                    // dependem do objeto React global. Se ficarem em vendor-three (chunk
                    // separado), React pode ser registrado duas vezes em runtime mesmo com
                    // resolve.dedupe — causando "Invalid hook call".
                    if (id.match(/node_modules[\\/](react|react-dom|scheduler|react-reconciler|react-use-measure|its-fine|suspend-react)[\\/]/)) {
                        return 'vendor-react';
                    }
                    // Ícones — compartilhado por quase tudo
                    if (id.includes('node_modules/lucide-react/')) {
                        return 'vendor-icons';
                    }
                    // three.js + satélites visuais puros (sem hooks React)
                    if (id.match(/node_modules[\\/](three|three-[\w-]+|troika-three-[\w-]+|@react-three|camera-controls|maath|meshline|stats-gl)[\\/]/)) {
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
