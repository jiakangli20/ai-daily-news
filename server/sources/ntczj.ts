import * as cheerio from "cheerio"

export default defineSource(async () => {
  const bases = [
    "https://czj.nantong.gov.cn/ntsczj/bmdt/bmdt.html",
  ]

  function normalizeDateString(input: string) {
    const s = input
      .replace(/年|\.|\//g, "-")
      .replace(/月/g, "-")
      .replace(/日/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    return s
  }

  function extractDateFromElement(a: cheerio.Cheerio<any>) {
    const li = a.closest("li")
    const tr = a.closest("tr")
    const candidates: string[] = []
    if (tr.length) {
      candidates.push(tr.find("td").last().text())
      candidates.push(tr.find("td").eq(1).text())
      candidates.push(tr.find("time").first().text())
      candidates.push(tr.find("span").last().text())
    }
    if (li.length) {
      candidates.push(li.find(".timedate, .time").first().text())
      candidates.push(li.find("span.timedate").first().text())
      candidates.push(li.find("time").first().text())
      candidates.push(li.find(".date").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time").first().text())

    // 标准格式正则：优先匹配标准格式 YYYY-MM-DD，然后匹配其他格式
    // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
    const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
    // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日），使用贪婪匹配确保正确捕获两位数的日期
    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/

    // 遍历所有候选文本，尝试匹配日期
    for (const raw of candidates) {
      const text = (raw || "").replace(/^\[|\]$/g, "").trim()
      if (!text) continue  // 跳过空文本

      // 优先尝试匹配标准格式 YYYY-MM-DD（使用 ^ 确保从开头匹配，避免部分匹配）
      let m = text.match(standardPattern)
      if (m) {
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) {
          return ts  // 标准格式匹配成功，立即返回
        }
      }

      // 如果标准格式不匹配，尝试其他格式
      m = text.match(datePattern)
      if (m) {
        // 找到匹配的日期，提取年、月、日并进行补零处理
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) return ts  // 返回有效的时间戳
      }
    }
    return undefined  // 未找到有效日期
  }

  function extractDateFromUrl(url: string) {
    try {
      const u = new URL(url)
      const path = u.pathname
      // /ntsczj/bmdt/content/xxx.html
      const m = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m) {
        const [_, y, mo, d] = m
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
    } catch {}
    return undefined
  }

  async function fetchOne(listUrl: string) {
    try {
      const html: string = await myFetch(listUrl)
      const $ = cheerio.load(html)

      // 南通财政局的数据在 #initData 隐藏div中
      const initData = $("#initData")
      if (!initData.length) {
        // 如果没有initData，尝试从普通选择器抓取
        const selectors = [
          ".list-ul li a",
          ".channelList ul li a",
          ".list ul li a",
          ".news_list li a",
          ".list_news li a",
          "#newsList li a",
          ".column-list li a",
        ]
        const $links = $(selectors.join(", "))
        const baseUrl = new URL(listUrl)

        const items = $links
          .map((_, el) => {
            const a = $(el)
            const href = a.attr("href")?.trim()
            let title = a.attr("title")?.trim() || a.text().trim()
            if (!href || !title) return null
            if (href.startsWith("javascript") || href.startsWith("#")) return null
            title = title.replace(/\s+/g, " ")

            const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
            const u = new URL(url)
            if (u.hostname !== "czj.nantong.gov.cn") return null
            
            let pubDate = extractDateFromElement(a)
            if (!pubDate) pubDate = extractDateFromUrl(url)
            
            return {
              id: url,
              title,
              url,
              pubDate,
            }
          })
          .get()

        return items as { id: string; title: string; url: string; pubDate?: number }[]
      }

      // 从initData中提取
      const $links = initData.find("ul.list-ul li a")
      const baseUrl = new URL(listUrl)

      const items = $links
        .map((_, el) => {
          const a = $(el)
          const href = a.attr("href")?.trim()
          let title = a.attr("title")?.trim() || a.text().trim()
          if (!href || !title) return null
          if (href.startsWith("javascript") || href.startsWith("#")) return null
          title = title.replace(/\s+/g, " ")

          const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
          const u = new URL(url)
          if (u.hostname !== "czj.nantong.gov.cn") return null
          
          // 只抓取本域名的详情页
          const isContentPage = (u.pathname.endsWith(".html") || u.pathname.endsWith(".shtml")) && !/index(_\d+)?\.(html|shtml)$/.test(u.pathname)
          if (!isContentPage) return null
          
          let pubDate = extractDateFromElement(a)
          if (!pubDate) pubDate = extractDateFromUrl(url)
          
          return {
            id: url,
            title,
            url,
            pubDate,
          }
        })
        .get()

      return items as { id: string; title: string; url: string; pubDate?: number }[]
    } catch {
      return []
    }
  }

  const results = await Promise.all(bases.map(fetchOne))
  const merged = results.flat()
  const unique = Array.from(new Map(merged.map(i => [i.id, i])).values())

  async function fetchDetailPubDate(url: string) {
    try {
      const html: string = await myFetch(url)
      const $ = cheerio.load(html)
      
      const candidateMeta = [
        'meta[name="PubDate"]',
        'meta[property="article:published_time"]',
        'meta[name="pubdate"]',
        'meta[name="publishdate"]',
        'meta[name="publish_time"]',
        'meta[name="og:release_date"]',
        'meta[property="og:published_time"]',
        'meta[name="release_date"]',
        'meta[itemprop="datePublished"]',
      ]
      for (const sel of candidateMeta) {
        const content = $(sel).attr("content")?.trim()
        if (content) {
          const ts = Date.parse(normalizeDateString(content))
          if (!Number.isNaN(ts)) return ts
        }
      }

      const textCandidates = [
        $("time").first().text(),
        $(".pubtime, .publish-time, .publish_time, .time, .date, .info .time").first().text(),
        $("span:contains(发布时间), p:contains(发布时间), div:contains(发布时间)").first().text(),
        $(".source span, .meta span").filter((_, el) => /\d{4}.\d{1,2}.\d{1,2}/.test($(el).text())).first().text(),
      ]
      
      // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
      const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
      // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日），使用贪婪匹配确保正确捕获两位数的日期
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        
        // 优先尝试匹配标准格式 YYYY-MM-DD（使用 ^ 确保从开头匹配，避免部分匹配）
        let m = (cleaned || text).match(standardPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 标准格式匹配成功，立即返回
          }
        }
        
        // 如果标准格式不匹配，尝试其他格式
        m = (cleaned || text).match(datePattern)
        if (m) {
          // 找到匹配的日期，提取年、月、日并进行补零处理
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) return ts
        }
      }
    } catch {
      // ignore
    }
    return undefined
  }

  const needDetail = unique.filter(i => !i.pubDate)
  const batch = needDetail.slice(0, 30)
  const tasks = batch.map(async (item) => {
    const ts = await fetchDetailPubDate(item.url)
    if (ts) item.pubDate = ts
    return item
  })
  if (tasks.length) await Promise.all(tasks)

  return unique
})
