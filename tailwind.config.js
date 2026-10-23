/** สร้าง app.css ด้วยคำสั่ง: npm run build */
module.exports = {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans Thai"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      // สีหลักของระบบ (เขียวศาลาโอสถ) — เปลี่ยนที่นี่ที่เดียว
      colors: {
        brand: { 50: '#effdf4', 100: '#dafbe6', 200: '#b7f3cd', 300: '#7fe6a8', 400: '#3fcf7c', 500: '#16b35d', 600: '#0b8541', 700: '#0a6c36', 800: '#0d562e', 900: '#0c4727' },   // 600 = ปุ่มหลัก (ตัวอักษรขาวอ่านชัด 4.7:1)
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.14)',
        lift: '0 2px 4px rgba(15,23,42,.05), 0 16px 32px -12px rgba(15,23,42,.22)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'sheet-up': { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } },
        'toast-in': { from: { opacity: 0, transform: 'translateY(12px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'sheet-up': 'sheet-up .22s cubic-bezier(.2,.8,.2,1)',
        'toast-in': 'toast-in .22s cubic-bezier(.2,.8,.2,1)',
        shimmer: 'shimmer 1.2s linear infinite',
      },
    },
  },
};
