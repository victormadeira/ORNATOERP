/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#1379F0',
                secondary: '#3B82F6',
                cta: '#F97316',
                background: '#F8FAFC',
                text: '#1E293B',
                dark: '#0f172a',
                glass: {
                    light: 'rgba(255, 255, 255, 0.7)',
                    dark: 'rgba(15, 23, 42, 0.7)',
                    border: 'rgba(255, 255, 255, 0.2)'
                }
            },
            fontFamily: {
                sans: ['DM Sans', 'Inter', 'sans-serif'],
                display: ['Playfair Display', 'Georgia', 'serif']
            },
            boxShadow: {
                'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
                'glass-dark': '0 4px 30px rgba(0, 0, 0, 0.3)',
            }
        },
    },
    plugins: [],
}
