import { generateDailyReport } from "./dify"
import { dailyReportExists, saveDailyReport } from "./daily-file"

/**
 * 执行日报生成任务
 */
async function executeDailyTask() {
  try {
    const now = new Date()
    const date = now.toISOString().split("T")[0] // YYYY-MM-DD

    logger.info(`[定时任务] 开始生成日报: ${date}`)

    // 检查今天的日报是否已存在
    const exists = await dailyReportExists(date)
    if (exists) {
      logger.info(`[定时任务] 日报已存在，跳过生成: ${date}`)
      return
    }

    // 调用 Dify 生成日报
    const htmlContent = await generateDailyReport()

    // 保存到本地文件
    await saveDailyReport(date, htmlContent)

    logger.success(`[定时任务] 日报生成成功: ${date}`)
  } catch (error) {
    logger.error("[定时任务] 生成日报失败:", error)
  }
}

/**
 * 计算距离下一个目标时间的毫秒数
 * @param targetHour 目标小时 (0-23)
 * @param targetMinute 目标分钟 (0-59)
 */
function getMillisecondsUntilTarget(targetHour: number, targetMinute: number): number {
  const now = new Date()
  const target = new Date()
  target.setHours(targetHour, targetMinute, 0, 0)

  // 如果目标时间已过，设置为明天
  if (target <= now) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

/**
 * 初始化定时任务
 * 每天早上 7:00 自动生成日报
 */
export function initDailyCron() {
  const TARGET_HOUR = 7
  const TARGET_MINUTE = 0

  // 设置首次执行
  const initialDelay = getMillisecondsUntilTarget(TARGET_HOUR, TARGET_MINUTE)

  setTimeout(() => {
    // 执行任务
    executeDailyTask()

    // 之后每24小时执行一次
    setInterval(() => {
      executeDailyTask()
    }, 24 * 60 * 60 * 1000) // 24小时
  }, initialDelay)

  const nextRun = new Date(Date.now() + initialDelay)
  logger.success(`日报定时任务已启动，下次执行时间: ${nextRun.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`)
}
