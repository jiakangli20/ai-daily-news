import { initDailyCron } from "#/utils/cron"

/**
 * Nitro 插件：在服务器启动时初始化日报定时任务
 */
export default defineNitroPlugin(() => {
  // 初始化定时任务
  initDailyCron()
})
