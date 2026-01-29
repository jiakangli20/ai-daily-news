import { join } from "node:path"
import { execSync } from "node:child_process"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import unocss from "unocss/vite"
import unimport from "unimport/unplugin"
import dotenv from "dotenv"
import nitro from "./nitro.config"
import { projectDir } from "./shared/dir"
import pwa from "./pwa.config"

// 监听 pre-sources.ts 变化，自动运行 presource 脚本
const watchPreSources = () => {
  return {
    name: 'watch-pre-sources',
    configureServer(server: any) {
      server.watcher.add(join(projectDir, 'shared/pre-sources.ts'))
      server.watcher.on('change', (file: string) => {
        if (file === join(projectDir, 'shared/pre-sources.ts')) {
          console.log('🔄 pre-sources.ts changed, regenerating...')
          try {
            execSync('pnpm exec tsx ./scripts/source.ts', { cwd: projectDir, stdio: 'inherit' })
          } catch (e) {
            console.error('Failed to regenerate sources.json:', e)
          }
        }
      })
    }
  }
}

dotenv.config({
  path: join(projectDir, ".env.server"),
})

export default defineConfig({
  resolve: {
    alias: {
      "~": join(projectDir, "src"),
      "@shared": join(projectDir, "shared"),
    },
  },
  plugins: [
    TanStackRouterVite({
      // error with auto import and vite-plugin-pwa
      // autoCodeSplitting: true,
    }),
    unimport.vite({
      dirs: ["src/hooks", "shared", "src/utils", "src/atoms"],
      presets: ["react", {
        from: "jotai",
        imports: ["atom", "useAtom", "useAtomValue", "useSetAtom"],
      }],
      imports: [
        { from: "clsx", name: "clsx", as: "$" },
        { from: "jotai/utils", name: "atomWithStorage" },
      ],
      dts: "imports.app.d.ts",
    }),
    unocss(),
    react(),
    pwa(),
    nitro(),
    watchPreSources(),
  ],
})
