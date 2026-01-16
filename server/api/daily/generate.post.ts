import { dailyReportExists, saveDailyReport } from "#/utils/daily-file"
import { generateDailyReport } from "#/utils/dify"

export default defineEventHandler(async () => {
  try {
    // 获取当前日期
    const now = new Date()
    const date = now.toISOString().split("T")[0] // YYYY-MM-DD

    // 检查今天的日报是否已存在
    const exists = await dailyReportExists(date)
    if (exists) {
      logger.info(`日报已存在: ${date}`)
      return {
        status: "success",
        message: "今日日报已存在",
        data: { date, existed: true },
      }
    }

    // 调用 Dify 生成日报
    logger.info(`开始生成日报: ${date}`)
    const htmlContent = await generateDailyReport()

    // 保存到本地文件
    await saveDailyReport(date, htmlContent)

    logger.success(`日报生成成功: ${date}`)
    return {
      status: "success",
      message: "日报生成成功",
      data: { date, existed: false },
    }
  } catch (error: any) {
    logger.error("生成日报失败:", error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : "生成日报失败",
    })
  }
})
