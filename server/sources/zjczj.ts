import * as cheerio from "cheerio"

export default defineSource(async () => {
  const bases = [
    "https://czj.zhenjiang.gov.cn/czj/bddt/list.shtml",
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

    // 使用贪婪匹配确保正确捕获两位数的日期，增加单词边界以避免部分匹配
    const datePattern = /\b(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])\b(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue
      const m = text.match(datePattern)
      if (m) {
        // 找到匹配的日期，提取年、月、日并进行补零处理
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
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
      // /czj/bddt/202510/334900e9b8224db384ae261327464bfb.shtml
      const m1 = path.match(/\/\d{4}(\d{2})\/\w+\.shtml$/)
      if (m1) {
        return undefined // 无法从URL中提取精确日期，只有年月
      }
      const m2 = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m2) {
        const [_, y, mo, d] = m2
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
        ".pageList ul li a",
        ".news_list li a",
        ".list li a",
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
          if (u.hostname !== "czj.zhenjiang.gov.cn") return null
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
      // 使用贪婪匹配确保正确捕获两位数的日期，增加单词边界以避免部分匹配
      const datePattern = /\b(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])\b(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        const m = (cleaned || text).match(datePattern)
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
