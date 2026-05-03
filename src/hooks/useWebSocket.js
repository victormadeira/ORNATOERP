// ═══════════════════════════════════════════════════════
// useWebSocket.js — Hook para WebSocket real-time (#23)
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_RECONNECT_BASE_MS = 1000; // 1s base → dobra a cada retry
const WS_RECONNECT_MAX_MS  = 30000; // teto 30s
const WS_MAX_RETRIES = 10;

export default function useWebSocket(onMessage) {
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const retriesRef = useRef(0);
    const reconnectTimerRef = useRef(null);
    const unmountedRef = useRef(false);
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    const connect = useCallback(() => {
        if (unmountedRef.current) return;
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
                const token = localStorage.getItem('erp_token');
                if (token) {
                    ws.send(JSON.stringify({ type: 'auth', token }));
                } else {
                    ws.close();
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'connected') setConnected(true);
                    onMessageRef.current?.(data);
                } catch (e) { /* ignore parse errors */ }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;
                if (!unmountedRef.current && retriesRef.current < WS_MAX_RETRIES) {
                    // Backoff exponencial: 1s → 2s → 4s → 8s → … → 30s (teto)
                    const delay = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_BASE_MS * 2 ** retriesRef.current);
                    retriesRef.current++;
                    reconnectTimerRef.current = setTimeout(connect, delay);
                }
            };

            ws.onerror = () => { ws.close(); };
        } catch (e) {
            // WebSocket not available
        }
    }, []);

    useEffect(() => {
        unmountedRef.current = false;
        connect();
        return () => {
            unmountedRef.current = true;
            clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    return { connected };
}
