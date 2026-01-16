import { promises as fs } from "node:fs"
import { join } from "node:path"
import { projectDir } from "@shared/dir"

const DAILY_REPORTS_DIR = join(projectDir, ".data", "daily-reports")

/**
 * 获取日报文件路径
 * @param date 日期字符串，格式：YYYY-MM-DD
 */
export function getDailyReportPath(date: string): string {
  const [year, month, day] = date.split("-")
  return join(DAILY_REPORTS_DIR, year, month, `${day}.html`)
}

/**
 * 保存日报到本地文件
 * @param date 日期字符串，格式：YYYY-MM-DD
 * @param htmlContent HTML 内容
 */
export async function saveDailyReport(date: string, htmlContent: string): Promise<void> {
  try {
    const filePath = getDailyReportPath(date)
    const dirPath = join(filePath, "..")

    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true })

    // 写入文件
    await fs.writeFile(filePath, htmlContent, "utf-8")

    logger.success(`日报已保存: ${filePath}`)
  } catch (error) {
    logger.error(`保存日报失败 (${date}):`, error)
    throw error
  }
}

/**
 * 读取指定日期的日报
 * @param date 日期字符串，格式：YYYY-MM-DD
 */
export async function getDailyReport(date: string): Promise<string | null> {
  try {
    const filePath = getDailyReportPath(date)
    const content = await fs.readFile(filePath, "utf-8")
    return content
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return null
    }
    logger.error(`读取日报失败 (${date}):`, error)
    throw error
  }
}

/**
 * 获取所有日报列表，按年月日分组
 */
export async function getDailyReportList(): Promise<{
  years: Array<{
    year: string
    months: Array<{
      month: string
      days: string[]
    }>
  }>
}> {
  try {
    // 确保目录存在
    await fs.mkdir(DAILY_REPORTS_DIR, { recursive: true })

    const years: Array<{
      year: string
      months: Array<{
        month: string
        days: string[]
      }>
    }> = []

    // 读取年份目录
    const yearDirs = await fs.readdir(DAILY_REPORTS_DIR)

    for (const year of yearDirs.sort().reverse()) {
      const yearPath = join(DAILY_REPORTS_DIR, year)
      const stat = await fs.stat(yearPath)

      if (!stat.isDirectory()) continue

      const months: Array<{ month: string, days: string[] }> = []

      // 读取月份目录
      const monthDirs = await fs.readdir(yearPath)

      for (const month of monthDirs.sort().reverse()) {
        const monthPath = join(yearPath, month)
        const monthStat = await fs.stat(monthPath)

        if (!monthStat.isDirectory()) continue

        // 读取日期文件
        const dayFiles = await fs.readdir(monthPath)
        const days = dayFiles
          .filter(file => file.endsWith(".html"))
          .map(file => file.replace(".html", ""))
          .sort()
          .reverse()

        if (days.length > 0) {
          months.push({ month, days })
        }
      }

      if (months.length > 0) {
        years.push({ year, months })
      }
    }

    return { years }
  } catch (error) {
    logger.error("获取日报列表失败:", error)
    throw error
  }
}

/**
 * 检查指定日期的日报是否存在
 */
export async function dailyReportExists(date: string): Promise<boolean> {
  try {
    const filePath = getDailyReportPath(date)
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
