import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Manifest e icone esistono già come file statici (public/manifest.webmanifest,
      // linkato in index.html): qui si genera solo il service worker, senza
      // duplicare quella configurazione o rischiare di disallinearla.
      manifest: false,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // I chunk più pesanti (WorldGlobe, localVision) restano appena sotto i
        // 2MB di default: margine per non escluderli in silenzio se crescono.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Il worker dei continenti dettagliati serve solo zoomando (vedi
        // globe/landLod.js), come i file di public/geo: niente precache,
        // altrimenti la prima visita scaricherebbe anche lui.
        globIgnores: ['**/landWorker-*.js'],
        // Gestori delle notifiche push (public/push-sw.js): il resto del
        // service worker lo genera Workbox.
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // I dati veri (profili, messaggi, eventi, realtime) vivono su
            // Supabase e cambiano in continuazione: non devono MAI essere
            // serviti dalla cache del service worker, offline o no.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  // La repo GitHub si chiama "Versemove": su GitHub Pages il sito vive
  // sotto quel sottopercorso, quindi gli asset devono puntare lì in produzione.
  base: process.env.GITHUB_PAGES ? '/Versemove/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // three.js/three-globe/react-globe.gl sono la parte più pesante del
          // chunk WorldGlobe (già in un chunk a parte grazie a React.lazy, vedi
          // App.jsx): separarle ulteriormente dal codice applicativo di
          // WorldGlobe.jsx fa sì che un aggiornamento a quest'ultimo non
          // invalidi la cache del browser per librerie che cambiano molto più
          // di rado — utile fin da ora, ancora di più con i 6 globi della Fase 2.
          if (
            id.includes('node_modules/three/') ||
            id.includes('node_modules/three-globe/') ||
            id.includes('node_modules/react-globe.gl/')
          ) {
            return 'vendor-three';
          }
        },
      },
    },
  },
})
