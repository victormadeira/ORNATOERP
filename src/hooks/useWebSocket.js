// ═══════════════════════════════════════════════════════
// useWebSocket.js — Hook para WebSocket real-time (#23)
// ═══════════════════════════════════════════════════════

import * as React from 'react';

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RETRIES = 10;

export default function useWebSocket(onMessage) {
    // Guarda defensiva contra bug raro de HMR/chunk split em dev onde o
    // módulo React é avaliado antes dos hooks serem expostos. Se acontecer,
    // devolve stub — o React re-renderiza no próximo tick e tudo funciona.
    // Em produção isso nunca dispara; em dev evita derrubar a ErrorBoundary
    // da página de Produção CNC inteira por conta de um null transitório.
    if (!React || typeof React.useState !== 'function') {
        return { connected: false };
    }

    const { useState, useEffect, useRef, useCallback } = React;

    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const retriesRef = useRef(0);
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = import.meta.env.DEV ? '3001' : window.location.port;
        const url = `${protocol}//${host}:${port}/ws`;

        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                retriesRef.current = 0;
                // Autenticar com JWT — obrigatório antes de receber broadcasts
                const token = localStorage.getItem('erp_token');
                if (token) {
                    ws.send(JSON.stringify({ type: 'auth', token }));
                } else {
                    // Sem token (usuário não logado), fechar — não há broadcasts úteis
                    ws.close();
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'connected') {
                        // Servidor confirmou autenticação
                        setConnected(true);
                    }
                    onMessageRef.current?.(data);
                } catch (e) { /* ignore parse errors */ }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;
                if (retriesRef.current < WS_MAX_RETRIES) {
                    retriesRef.current++;
                    setTimeout(connect, WS_RECONNECT_DELAY);
                }
            };

            ws.onerror = () => {
                ws.close();
            };
        } catch (e) {
            // WebSocket not available
        }
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    return { connected };
}
