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
                background: '#F8FAFC',
                dark: '#0f172a',
            },
            fontFamily: {
                sans: ['Inter', 'DM Sans', 'sans-serif'],
                display: ['Inter', 'sans-serif']
            },
            boxShadow: {
                'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
                'glass-dark': '0 4px 30px rgba(0, 0, 0, 0.3)',
            }
        },
    },
    plugins: [],
}
