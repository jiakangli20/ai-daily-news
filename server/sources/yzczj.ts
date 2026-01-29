import * as cheerio from "cheerio"

interface ApiResponse {
  success: boolean
  code: string
  data: {
    html: string
  }
}

export default defineSource(async () => {
  const baseUrl = "https://czj.yangzhou.gov.cn"
  const apiUrl = `${baseUrl}/api-gateway/jpaas-publish-server/front/page/build/unit`
  
  // 获取前3页数据
  const pages = [1, 2, 3]
  
  async function fetchOne(pageNo: number) {
    try {
      const params = new URLSearchParams({
        parseType: "bulidstatic",
        webId: "NuQPpnZycKgxHWRPidPDl",
        tplSetId: "LmNssD6Eo0DO7Gf77breT",
        pageType: "column",
        tagId: "当前栏目list",
        editType: "null",
        pageId: "QsEYSlCrONSfZWIdi077J",
        pageNo: pageNo.toString(),
      })

      const res: ApiResponse = await myFetch(`${apiUrl}?${params.toString()}`)

      if (!res.success || !res.data?.html) {
        return []
      }

      const $ = cheerio.load(res.data.html)
      const items: Array<{ id: string; title: string; url: string; pubDate?: number }> = []

      // 解析新闻列表
      $("ul li").each((_, el) => {
        const $li = $(el)
        const $a = $li.find("a")
        const $span = $li.find("span")

        const href = $a.attr("href")?.trim()
        const title = $a.text().trim()
        const dateText = $span.text().trim()

        if (!href || !title) return

        // 构建完整URL
        const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
        
        // 解析日期 [2025-11-03]
        let pubDate: number | undefined
        const dateMatch = dateText.match(/\[(\d{4}-\d{2}-\d{2})\]/)
        if (dateMatch) {
          const ts = Date.parse(dateMatch[1])
          if (!Number.isNaN(ts)) {
            pubDate = ts
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
      console.error(`扬州财政: 获取第${pageNo}页失败`, error)
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
