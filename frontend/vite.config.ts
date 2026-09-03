import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  // loadEnv (not process.env) because Vite only auto-loads .env into
  // process.env for client code, not for this config file itself — without
  // it, VITE_API_PROXY_TARGET in frontend/.env is silently ignored and every
  // /api call gets proxied to the wrong port with no clear error.
  const env = loadEnv(mode, process.cwd(), '');
  // Overridable so local setups where :8080 is taken can point at another API
  // port. Must match `SERVER_PORT` in api/.env.
  const API_PROXY_TARGET = env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

  return {
    plugins: [
      // nodePolyfills(),
      react(),
      tailwindcss(),
      tsconfigPaths(),
      {
        name: 'markdown-loader',
        transform(code, id) {
          if (id.slice(-3) === '.md') {
            // For .md files, get the raw content
            return `export default ${JSON.stringify(code)};`;
          }
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          target: API_PROXY_TARGET,
          changeOrigin: true,
          // rewrite: path => path.replace(/^\/api/, ''),
        },
        '/static': {
          target: API_PROXY_TARGET,
          changeOrigin: true,
          // rewrite: path => path.replace(/^\/static/, ''),
        },
      },
    },
    publicDir: 'public',
  };
});
