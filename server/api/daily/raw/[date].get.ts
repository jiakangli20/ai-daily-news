import { getDailyReport } from "#/utils/daily-file"

export default defineEventHandler(async (event) => {
  try {
    const date = getRouterParam(event, "date")

    if (!date) {
      throw createError({
        statusCode: 400,
        message: "缺少日期参数",
      })
    }

    // 验证日期格式 YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      throw createError({
        statusCode: 400,
        message: "日期格式错误，应为 YYYY-MM-DD",
      })
    }

    const content = await getDailyReport(date)

    if (!content) {
      throw createError({
        statusCode: 404,
        message: `未找到 ${date} 的日报`,
      })
    }

    setResponseHeader(event, "Content-Type", "text/html; charset=utf-8")
    return content
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logger.error("获取原始日报失败:", error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : "获取原始日报失败",
    })
  }
})
