import * as cheerio from "cheerio"

export default defineSource(async () => {
  const bases = [
    "https://czj.yancheng.gov.cn/col/col305/index.html",
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
    
    // 扩展可能的日期元素选择器，适配盐城财政网站
    if (tr.length) {
      candidates.push(tr.find("td").last().text().trim())
      candidates.push(tr.find("td").eq(1).text().trim())
      candidates.push(tr.find("time").first().text().trim())
      candidates.push(tr.find("span").last().text().trim())
      // 添加表格中可能包含日期的其他列
      candidates.push(tr.find("td").eq(2).text().trim())
      candidates.push(tr.find("td.date").text().trim())
      candidates.push(tr.find("td.time").text().trim())
    }
    
    if (li.length) {
      // 上海财政局使用 span.listTime
      candidates.push(li.find("span.listTime").first().text().trim())
      candidates.push(li.find(".time").first().text().trim())
      candidates.push(li.find("span").last().text().trim())
      candidates.push(li.find("time").first().text().trim())
      candidates.push(li.find(".date").first().text().trim())
      // 添加盐城财政可能使用的特定类名
      candidates.push(li.find(".li_r").first().text().trim())  // 右侧信息栏
      candidates.push(li.find(".date-info").first().text().trim())
      candidates.push(li.find(".pub-date").first().text().trim())
      candidates.push(li.find(".fr").first().text().trim())  // float right 元素常放日期
      candidates.push(li.find(".Article_PublishDate").first().text().trim()) // 盐城财政常见日期类名
      candidates.push(li.find(".timestyle142215").first().text().trim()) // 盐城财政特定时间类名
      // 特别针对盐城财政的日期格式
      candidates.push(li.find(".bt-right").first().text().trim()) // 盐城财政右侧日期显示
    }
    
    // 检查a标签周围的元素
    candidates.push((a.attr("data-time") || "").trim())
    candidates.push(a.parent().find("time, .date, .time, span.time").first().text().trim())
    candidates.push(a.siblings(".time, .date, .pub-date").first().text().trim())
    candidates.push(a.next(".time, .date, .pub-date").first().text().trim())
    candidates.push(a.prev(".time, .date, .pub-date").first().text().trim())

    // 标准格式正则：优先匹配标准格式 YYYY-MM-DD，然后匹配其他格式
    // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
    const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
    // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日），使用贪婪匹配确保正确捕获两位数的日期
    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    // 常州财政局格式：匹配 MM-DD 格式（如 01-14）
    const changzhouPattern = /(0?[1-9]|1[0-2])[\/\-](3[01]|[12]\d|0?[1-9])/

    // 遍历所有候选文本，尝试匹配日期
    for (const text of candidates) {
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

      // 尝试匹配 MM-DD 格式（适用于当前年份）
      m = text.match(changzhouPattern)
      if (m) {
        // 找到匹配的月、日，添加当前年份
        const currentYear = new Date().getFullYear()
        const [, month, day] = m
        const normalized = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) return ts  // 返回有效的时间戳
      }

      // 如果标准格式和常州格式都不匹配，尝试其他格式
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
      // /art/2026/1/13/art_305_4394993.html
      const m1 = path.match(/\/art\/(\d+)\/(\d+)\/(\d+)\//)
      if (m1) {
        const year = m1[1]
        const month = m1[2]
        const day = m1[3]
        const ts = Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
        if (!Number.isNaN(ts)) return ts
      }
    } catch {}
    return undefined
  }

  async function fetchOne(listUrl: string) {
    try {
      const html: string = await myFetch(listUrl)
      // 处理CDATA数据
      let processedHtml = html
      const cdataMatches = html.match(/<!\[CDATA\[(.*?)\]\]>/gs)
      if (cdataMatches) {
        const extractedContent = cdataMatches.map(match => {
          const content = match.replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '')
          return content
        }).join('')
        processedHtml = extractedContent
      }
      
      const $ = cheerio.load(processedHtml)

      const selectors = [
        "a[title]", 
        "ul li a",
        ".news_list li a",
        ".list li a",
        ".list_news li a",
        "#newsList li a",
        ".column-list li a",
        "a[href*='/art/']",
        ".zxzx_list a",     // 可能的资讯列表样式
        ".list-item a",     // 列表项样式
        "a[target='_blank'][href*='/art/']",  // 新窗口打开的文章链接
        ".arti_tit a",      // 盐城财政特有文章标题样式
        "a[style*='color']",  // 盐城财政可能使用的样式链接
        "li a[target='_blank'][href^='/art/']"  // 盐城财政特有的列表结构
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
          // 确保是 czj.yancheng.gov.cn 域名
          if (u.hostname !== "czj.yancheng.gov.cn") return null
          // 确保是 /art/ 路径的详情页，排除列表页
          const isArtPage = u.pathname.includes("/art/") && u.pathname.endsWith(".html")
          if (!isArtPage) return null
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
        $(".pubtime, .publish-time, .publish_time, .time, .date, .info .time, .Article_PublishDate").first().text(),
        $("span:contains(发布时间), p:contains(发布时间), div:contains(发布时间), span:contains(发布日期), p:contains(发布日期), div:contains(发布日期)").first().text(),
        $(".source span, .meta span").filter((_, el) => /\d{4}.\d{1,2}.\d{1,2}/.test($(el).text())).first().text(),
        $(".timestyle142215").first().text(), // 盐城财政特定时间样式
      ]
      
      // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
      const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
      // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日），使用贪婪匹配确保正确捕获两位数的日期
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](3[01]|[12]\d|0?[1-9])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
      
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        const cleaned = text.replace(/.*?(发布时间|发布日期|时间|日期)[:：]\s*/, "")
        
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

  // 按时间倒序排序，确保最新新闻在前
  unique.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
  return unique
})
