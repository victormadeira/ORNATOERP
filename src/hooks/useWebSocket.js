// ═══════════════════════════════════════════════════════
// useWebSocket.js — Hook para WebSocket real-time (#23)
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RETRIES = 10;

export default function useWebSocket(onMessage) {
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
                setConnected(true);
                retriesRef.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
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
