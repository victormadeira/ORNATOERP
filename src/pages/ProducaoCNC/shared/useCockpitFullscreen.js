// useCockpitFullscreen — adiciona classe CSS no body para ocultar a chrome do ERP
// enquanto o cockpit CNC está aberto.
//
// Uso:
//   useCockpitFullscreen(true);  // ativa ao montar, remove ao desmontar
//
// O CSS correspondente está em index.css:
//   .cnc-cockpit-fullscreen .topbar-fixed        { display: none !important; }
//   .cnc-cockpit-fullscreen .mobile-bottom-nav   { display: none !important; }
import { useEffect } from 'react';

export function useCockpitFullscreen(active = true) {
    useEffect(() => {
        if (!active) return;
        document.body.classList.add('cnc-cockpit-fullscreen');
        return () => {
            document.body.classList.remove('cnc-cockpit-fullscreen');
        };
    }, [active]);
}
