import { useState, useEffect } from 'react';

/**
 * Retorna o valor debounced — só atualiza após `delay` ms sem novas mudanças.
 * Uso: const debouncedSearch = useDebounce(search, 300);
 */
export function useDebounce(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}
