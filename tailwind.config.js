/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary:    '#1379F0',
                accent:     '#C9A96E',
                background: '#F2F2F6',
                dark:       '#0f172a',
            },
            fontFamily: {
                // Inter: fonte principal do ERP (corpo, labels, tabelas, botões)
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                // Space Grotesk: apenas em KPIs grandes, h1 display, landing
                display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'sans-serif'],
                // Mono: código, G-code, parâmetros técnicos
                mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
            },
            borderRadius: {
                xs:   '3px',
                sm:   '5px',
                DEFAULT: '6px',
                md:   '6px',
                lg:   '8px',
                xl:   '10px',
                '2xl': '12px',
            },
            boxShadow: {
                card: '0 1px 3px rgba(0,0,0,.09), 0 4px 12px rgba(0,0,0,.06)',
                md:   '0 2px 8px rgba(0,0,0,.11), 0 8px 20px rgba(0,0,0,.08)',
            },
        },
    },
    plugins: [],
}
