import tailwindcss from '@tailwindcss/vite';

// Hộp duyệt video (M0.5). SPA thuần: mọi dữ liệu lấy qua /api (Caddy proxy ở prod, devProxy ở dev).
export default defineNuxtConfig({
  vite: { plugins: [tailwindcss()] },
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Video Module — Hộp duyệt',
      htmlAttrs: { lang: 'vi' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  nitro: {
    // Dùng 127.0.0.1 thay vì localhost: Node ưu tiên ::1, dễ trúng process khác đang giữ [::]:cổng.
    devProxy: {
      '/api': { target: `${process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3100'}/api`, changeOrigin: true },
    },
  },
  typescript: { strict: true },
});
