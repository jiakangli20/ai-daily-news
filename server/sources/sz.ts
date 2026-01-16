import * as cheerio from "cheerio"

export default defineSource(async () => {
  const bases = [
    "https://news.2500sz.com/szgc/index.shtml",
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
      candidates.push(li.find(".time").first().text())
      candidates.push(li.find("span").last().text())
      candidates.push(li.find("time").first().text())
      candidates.push(li.find(".date").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time").first().text())

    // 日期匹配正则：优先匹配"时间：YYYY-MM-DD"格式，然后匹配标准格式 YYYY-MM-DD，最后匹配其他格式
    // 时间格式正则：匹配"时间：YYYY-MM-DD"或"时间:YYYY-MM-DD"格式（如：时间：2025-12-31）
    const timePrefixPattern = /时间[：:]\s*(20\d{2})-(\d{1,2})-(\d{1,2})/
    // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
    const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/
    // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日）
    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue
      
      // 优先尝试匹配"时间：YYYY-MM-DD"格式
      let m = text.match(timePrefixPattern)
      if (m) {
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) {
          return ts  // 时间格式匹配成功，立即返回
        }
      }
      
      // 尝试匹配标准格式 YYYY-MM-DD（使用 ^ 确保从开头匹配，避免部分匹配）
      m = text.match(standardPattern)
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
        // 找到匹配的日期，规范化后转换为时间戳
        const normalized = normalizeDateString(m[0])
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) return ts
      }
    }
    return undefined
  }

  function extractDateFromUrl(url: string) {
    try {
      const u = new URL(url)
      const path = u.pathname
      // /doc/2025/11/04/1179610.shtml
      const m1 = path.match(/\/doc\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//)
      if (m1) {
        const [_, y, mo, d] = m1
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：YYYY-MM-DD 或 YYYY/MM/DD
      const m2 = path.match(/(20\d{2})[\-\/_](\d{1,2})[\-\/_](\d{1,2})/)
      if (m2) {
        const [_, y, mo, d] = m2
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：YYYYMMDD
      const m3 = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m3) {
        const [_, y, mo, d] = m3
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

      const selectors = [
        "#newsList li a",
        ".news_list li a",
        ".list li a",
        ".list_news li a",
        "#newsList li a",
        ".column-list li a",
        "ul li a[title]",
        "ul li a",
        "a[href*='/doc/']",
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
          // 确保是 news.2500sz.com 域名
          if (u.hostname !== "news.2500sz.com") return null
          // 确保是 /doc/ 路径的详情页
          const isDocPage = u.pathname.includes("/doc/") && u.pathname.endsWith(".shtml")
          if (!isDocPage) return null
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
        'meta[property="article:published_time"]',
        'meta[name="PubDate"]',
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
      // 优先匹配"时间：YYYY-MM-DD"格式，然后匹配标准格式 YYYY-MM-DD
      const timePrefixPattern = /时间[：:]\s*(20\d{2})-(\d{1,2})-(\d{1,2})/
      const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        
        // 优先尝试匹配"时间：YYYY-MM-DD"格式
        let m = text.match(timePrefixPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 时间格式匹配成功，立即返回
          }
        }
        
        // 尝试匹配标准格式 YYYY-MM-DD（在原始文本上优先）
        m = text.match(standardPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 标准格式匹配成功，立即返回
          }
        }
        
        // 如果原始文本上标准格式不匹配，尝试清理后的文本
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        const searchText = cleaned || text
        
        // 在清理后的文本上再次尝试标准格式
        m = searchText.match(standardPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 标准格式匹配成功，立即返回
          }
        }
        
        // 如果标准格式都不匹配，尝试其他格式
        m = searchText.match(datePattern)
        if (m) {
          const ts = Date.parse(normalizeDateString(m[0]))
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

  return unique.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
})
