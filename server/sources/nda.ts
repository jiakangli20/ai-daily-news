import * as cheerio from "cheerio"

const sjzg = defineSource(async () => {
  const bases = [
    "https://www.nda.gov.cn/sjj/ywpd/sjzg/list/index_pc_1.html",
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
    const candidates: string[] = []
    if (li.length) {
      candidates.push(li.find("time").first().text())
      candidates.push(li.find("span").last().text())
      candidates.push(li.find(".date, .time").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time").first().text())

    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue
      const m = text.match(datePattern)
      if (m) {
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
      // /sjj/ywpd/sjzg/1103/20251103212739839895489_pc.html
      // 日期格式：YYYYMMDD
      const m = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m) {
        const [_, y, mo, d] = m
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：YYYY-MM-DD 或 YYYY/MM/DD
      const m1 = path.match(/(20\d{2})[\-\/_](\d{1,2})[\-\/_](\d{1,2})/)
      if (m1) {
        const [_, y, mo, d] = m1
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
        "ul li a[title]",
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
          // 确保是 nda.gov.cn 域名
          if (u.hostname !== "www.nda.gov.cn") return null
          // 确保是详情页，不是列表页，并且是 sjzg 路径
          const isContentPage = (u.pathname.endsWith(".html") || u.pathname.endsWith(".shtml")) && !/index(_\d+)?\.html$/.test(u.pathname) && u.pathname.includes("/sjzg/")
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
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        const m = (cleaned || text).match(datePattern)
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

  // 按日期排序
  return unique.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
})

const zcgh = defineSource(async () => {
  const bases = [
    "https://www.nda.gov.cn/sjj/ywpd/zcgh/list/index_pc_1.html",
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
    const candidates: string[] = []
    if (li.length) {
      candidates.push(li.find("time").first().text())
      candidates.push(li.find("span").last().text())
      candidates.push(li.find(".date, .time").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time").first().text())

    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue
      const m = text.match(datePattern)
      if (m) {
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
      // /sjj/ywpd/zcgh/1031/20251031201029060076474_pc.html
      // 日期格式：YYYYMMDD
      const m = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m) {
        const [_, y, mo, d] = m
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：YYYY-MM-DD 或 YYYY/MM/DD
      const m1 = path.match(/(20\d{2})[\-\/_](\d{1,2})[\-\/_](\d{1,2})/)
      if (m1) {
        const [_, y, mo, d] = m1
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
        "ul li a[title]",
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
          // 确保是 nda.gov.cn 域名
          if (u.hostname !== "www.nda.gov.cn") return null
          // 确保是详情页，不是列表页，并且是 zcgh 路径
          const isContentPage = (u.pathname.endsWith(".html") || u.pathname.endsWith(".shtml")) && !/index(_\d+)?\.html$/.test(u.pathname) && u.pathname.includes("/zcgh/")
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
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        const m = (cleaned || text).match(datePattern)
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

  // 按日期排序
  return unique.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
})

const szsh = defineSource(async () => {
  const bases = [
    "https://www.nda.gov.cn/sjj/ywpd/szsh/list/index_pc_1.html",
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
    const candidates: string[] = []
    if (li.length) {
      candidates.push(li.find("time").first().text())
      candidates.push(li.find("span").last().text())
      candidates.push(li.find(".date, .time").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time").first().text())

    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue
      const m = text.match(datePattern)
      if (m) {
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
      // /sjj/ywpd/szsh/1031/20251031201029060076474_pc.html
      // 日期格式：YYYYMMDD
      const m = path.match(/(20\d{2})(\d{2})(\d{2})/)
      if (m) {
        const [_, y, mo, d] = m
        const ts = Date.parse(`${y}-${mo}-${d}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：YYYY-MM-DD 或 YYYY/MM/DD
      const m1 = path.match(/(20\d{2})[\-\/_](\d{1,2})[\-\/_](\d{1,2})/)
      if (m1) {
        const [_, y, mo, d] = m1
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
        "ul li a[title]",
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
          // 确保是 nda.gov.cn 域名
          if (u.hostname !== "www.nda.gov.cn") return null
          // 确保是详情页，不是列表页，并且是 szsh 路径
          const isContentPage = (u.pathname.endsWith(".html") || u.pathname.endsWith(".shtml")) && !/index(_\d+)?\.html$/.test(u.pathname) && u.pathname.includes("/szsh/")
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
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|时间)[:：]\s*/, "")
        const m = (cleaned || text).match(datePattern)
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

  // 按日期排序
  return unique.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
})

export default defineSource({
  "nda": sjzg,
  "nda-sjzg": sjzg,
  "nda-zcgh": zcgh,
  "nda-szsh": szsh,
})
