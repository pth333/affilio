import tailwindcss from '@tailwindcss/vite';

// Affilio web. SPA thuần: mọi dữ liệu lấy qua /api (Caddy proxy ở prod, devProxy ở dev).
// Auto-import: ref/computed/… (Vue), composables/, utils/ & api/ (named export), components/ (mọi thư mục con, không tiền tố).
export default defineNuxtConfig({
  vite: { plugins: [tailwindcss()] },
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  components: [{ path: '~/components', pathPrefix: false }],
  // api/: mỗi tài nguyên một file (video.ts, product.ts…), tự import như utils/.
  imports: { dirs: ['api'] },
  app: {
    head: {
      title: 'Affilio',
      htmlAttrs: { lang: 'vi' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#fbf5ed' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap',
        },
      ],
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
