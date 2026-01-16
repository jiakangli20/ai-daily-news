import process from "node:process"
import type { VitePWAOptions } from "vite-plugin-pwa"
import { VitePWA } from "vite-plugin-pwa"

const pwaOption: Partial<VitePWAOptions> = {
  includeAssets: ["icons/qyzx.jpg"],
  filename: "swx.js",
  manifest: {
    name: "NewsNow",
    short_name: "NewsNow",
    description: "Elegant reading of real-time and hottest news",
    theme_color: "#F14D42",
    icons: [
      {
        src: "icons/qyzx.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "icons/qyzx.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
      {
        src: "icons/qyzx.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "icons/qyzx.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    navigateFallbackDenylist: [/^\/api/],
  },
  devOptions: {
    enabled: process.env.SW_DEV === "true",
    type: "module",
    navigateFallback: "index.html",
  },
}

export default function pwa() {
  return VitePWA(pwaOption)
}
