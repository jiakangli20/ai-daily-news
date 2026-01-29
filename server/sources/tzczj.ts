import * as cheerio from "cheerio"

interface ApiResponse {
  success: boolean
  code: string
  data: {
    html: string
  }
}

export default defineSource(async () => {
  const baseUrl = "https://czj.taizhou.gov.cn"
  const apiUrl = `${baseUrl}/api-gateway/jpaas-publish-server/front/page/build/unit`
  
  // 获取前3页数据
  const pages = [1, 2, 3]
  
  async function fetchOne(pageNo: number) {
    try {
      const params = new URLSearchParams({
        parseType: "bulidstatic",
        webId: "143fd1aa576a402f9dec5816902017fb",
        tplSetId: "59637d67c4d74c6c85a42ebd285f8813",
        pageType: "column",
        tagId: "当前栏目信息列表",
        editType: "null",
        pageId: "2b240c00f6894756b3265a2ab0e67073",
        pageNo: pageNo.toString(),
      })

      const res: ApiResponse = await myFetch(`${apiUrl}?${params.toString()}`)

      if (!res.success || !res.data?.html) {
        return []
      }

      const $ = cheerio.load(res.data.html)
      const items: Array<{ id: string; title: string; url: string; pubDate?: number }> = []

      // 解析新闻列表 - 泰州使用 ul.lmy-list-ul li 结构
      $("ul.lmy-list-ul li, ul li").each((_, el) => {
        const $li = $(el)
        const $a = $li.find("a")
        const $span = $li.find("span")

        const href = $a.attr("href")?.trim()
        const title = $a.attr("title")?.trim() || $a.text().trim()
        const dateText = $span.text().trim()

        if (!href || !title) return

        // 构建完整URL
        const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
        
        // 解析日期 - 泰州格式为 2025-10-31（不带方括号）
        let pubDate: number | undefined
        
        // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
        const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
        // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日），使用贪婪匹配确保正确捕获两位数的日期
        const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
        
        // 优先尝试匹配标准格式 YYYY-MM-DD
        let m = dateText.match(standardPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            pubDate = ts
          }
        } else {
          // 如果标准格式不匹配，尝试其他格式
          m = dateText.match(datePattern)
          if (m) {
            // 找到匹配的日期，提取年、月、日并进行补零处理
            const [, year, month, day] = m
            const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            const ts = Date.parse(normalized)
            if (!Number.isNaN(ts)) {
              pubDate = ts
            }
          }
        }

        // 从URL中提取日期作为备选
        if (!pubDate) {
          const urlMatch = url.match(/\/art\/(\d{4})\//)
          if (urlMatch) {
            // 尝试从URL路径中提取日期
            // 格式：/art/2025/art_xxx.html
            pubDate = Date.parse(`${urlMatch[1]}-01-01`) // 至少有个年份
          }
        }

        items.push({
          id: url,
          title,
          url,
          pubDate,
        })
      })

      return items
    } catch (error) {
      console.error(`泰州财政: 获取第${pageNo}页失败`, error)
      return []
    }
  }

  const results = await Promise.all(pages.map(fetchOne))
  const merged = results.flat()
  
  // 去重
  const unique = Array.from(new Map(merged.map(i => [i.id, i])).values())

  // 按日期排序（最新的在前）
  unique.sort((a, b) => {
    const dateA = a.pubDate || 0
    const dateB = b.pubDate || 0
    return dateB - dateA
  })

  return unique
})
