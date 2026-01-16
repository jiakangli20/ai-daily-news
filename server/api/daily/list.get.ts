import { getDailyReportList } from "#/utils/daily-file"

export default defineEventHandler(async () => {
  try {
    const list = await getDailyReportList()
    return {
      status: "success",
      data: list,
    }
  } catch (error: any) {
    logger.error("获取日报列表失败:", error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : "获取日报列表失败",
    })
  }
})
