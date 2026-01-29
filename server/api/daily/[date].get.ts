export default defineEventHandler(async () => {
  try {
    // 该 JSON 接口已弃用（前端改为 iframe 加载 raw HTML）
    // 请使用 /api/daily/raw/:date
    throw createError({
      statusCode: 410,
      message: "This endpoint is deprecated. Use /api/daily/raw/:date",
    })
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logger.error("获取日报失败:", error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : "获取日报失败",
    })
  }
})
