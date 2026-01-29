import * as cheerio from "cheerio"

export default defineSource(async () => {
  const bases = [
    "https://cz.wuxi.gov.cn/gzdt/index.shtml",
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
      // 优先查找常见的日期元素（无锡财政使用 span.riqi）
      candidates.push(li.find("span.riqi").first().text())  // 无锡财政特有的日期元素
      candidates.push(li.find(".time").first().text())
      candidates.push(li.find("time").first().text())
      candidates.push(li.find("span").last().text())
      candidates.push(li.find(".date, .time").first().text())
    }
    candidates.push(a.attr("data-time") || "")
    candidates.push(a.parent().find("time, .date, .time, span.riqi").first().text())

    // 日期匹配正则：优先匹配标准格式 YYYY-MM-DD 或 YYYY/MM/DD
    // 标准格式正则：精确匹配 YYYY-MM-DD 或 YYYY/MM/DD 格式（如 2025-12-31 或 2025/12/31）
    const standardPattern = /^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s|$)/  // 标准格式：支持连字符和斜杠
    
    // 遍历所有候选文本，尝试匹配日期
    for (const raw of candidates) {
      const text = (raw || "").trim()
      if (!text) continue  // 跳过空文本
      
      // 优先尝试匹配标准格式 YYYY-MM-DD 或 YYYY/MM/DD
      // 先尝试直接从文本开头匹配（使用 ^ 确保从开头匹配）
      let m = text.match(standardPattern)
      if (m) {
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) {
          return ts  // 标准格式匹配成功，立即返回
        }
      }
      
      // 如果标准格式从开头匹配失败，尝试从文本中提取标准格式的日期
      // 使用更宽松的匹配，找到文本中的 YYYY-MM-DD 或 YYYY/MM/DD 格式（确保日期部分是2位）
      // 注意：这里日期部分使用 \d{2} 强制匹配2位数字，避免部分匹配
      const relaxedStandardPattern = /(20\d{2})[-\/](\d{1,2})[-\/](\d{2})(?:\s|$|来源|：|:|\D|\.)/
      m = text.match(relaxedStandardPattern)
      if (m) {
        const [, year, month, day] = m
        // 验证日期是否合理（1-31）
        const dayNum = parseInt(day, 10)
        if (dayNum >= 1 && dayNum <= 31) {
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 标准格式匹配成功，立即返回
          }
        }
      }
      
      // 绝对不使用旧正则，因为旧正则会部分匹配（如匹配到 "2025/12/3" 而不是 "2025/12/31"）
      // 如果标准格式都匹配失败，返回 undefined，让调用方尝试其他方法（如URL提取）
    }
    return undefined
  }

  function extractDateFromUrl(url: string) {
    try {
      const u = new URL(url)
      const path = u.pathname
      // 优先匹配 /doc/YYYY/MM/DD/ 格式的URL（无锡财政特有格式）
      const mDoc = path.match(/\/doc\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//)
      if (mDoc) {
        const [_, y, mo, d] = mDoc
        const ts = Date.parse(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
        if (!Number.isNaN(ts)) return ts
      }
      // 备用模式：匹配其他路径格式
      const m1 = path.match(/(20\d{2})[\-\/_](\d{1,2})[\-\/_](\d{1,2})/)
      if (m1) {
        const [_, y, mo, d] = m1
        const ts = Date.parse(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
        if (!Number.isNaN(ts)) return ts
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
        "#newsList li a",
        ".news_list li a",
        ".list li a",
        ".list_news li a",
        ".list01 li a",
        ".list02 li a",
        ".xxgk-list li a",
        ".xwzx_list li a",
        ".column-list li a",
        "ul li a[title]",
        "ul li a",
        "a[href$='.shtml']",
        "a[href$='.html']",
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
          // 排除顶部/侧边导航链接和栏目标题
          if (/^(网站首页|咨询中心|首页|联系我们|政务服务|互动交流|专题|专题专栏|政声传递|站点地图|网站地图|公告公示|隐私安全|工作动态)$/i.test(title.trim())) return null
          title = title.replace(/\s+/g, " ")

          const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
          const u = new URL(url)
          // 仅接受本域名
          if (u.hostname !== "cz.wuxi.gov.cn") return null
          // 显式排除：站首页/咨询中心/信息公开目录
          const excludedPath = /^\/(index\.shtml|zxzx\/|zfxxgk\/)/.test(u.pathname)
          if (excludedPath) return null
          const isContentPage = (u.pathname.endsWith(".html") || u.pathname.endsWith(".shtml")) && !/index(_\d+)?\.html$/.test(u.pathname) && !/index\.shtml$/.test(u.pathname)
          if (!isContentPage) return null
          // 仅抓取工作动态目录（列表页在 /gzdt/，详情页在 /doc/ 带日期路径）
          const inGzdt = /\/gzdt\//.test(u.pathname)
          const inDocWithDate = /\/doc\/\d{4}\/\d{2}\/\d{2}\//.test(u.pathname) // /doc/2025/10/30/xxx.shtml
          const inExcludedSections = /^\/(gggs\/|fzlm\/ysaq\/)/.test(u.pathname)
          if ((!inGzdt && !inDocWithDate) || inExcludedSections) return null
          // 排除导航/面包屑区域和侧边栏的栏目导航链接
          const inNav = !!a.closest("nav, header, .nav, .menu, .breadcrumb, .crumb, .topnav, .sidenav").length
          const inSidebar = !!a.closest(".sidebar, .side-nav, .column").length && /\/index\.shtml$/.test(u.pathname)
          if (inSidebar || inNav) return null
          // 若存在明显的列表容器则优先限定，否则放行内容页（兼容不同模版）
          // 不强制要求在列表容器内，避免漏抓
          // const inListContainer = !!a.closest(".news_list, .list_news, .list, .list01, .list02, .xxgk-list, .xwzx_list, .column-list, #newsList").length

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
      // 优先尝试匹配标准格式 YYYY-MM-DD 或 YYYY/MM/DD（从开头）
      const standardPattern = /^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s|$)/
      for (const raw of textCandidates) {
        const text = (raw || "").replace(/\s+/g, " ").trim()
        if (!text) continue
        
        // 优先尝试匹配标准格式 YYYY-MM-DD 或 YYYY/MM/DD（从开头）
        let m = text.match(standardPattern)
        if (m) {
          const [, year, month, day] = m
          const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          const ts = Date.parse(normalized)
          if (!Number.isNaN(ts)) {
            return ts  // 标准格式匹配成功，立即返回
          }
        }
        
        // 如果标准格式从开头匹配失败，尝试从文本中提取标准格式的日期（更宽松的匹配）
        // 注意：这里日期部分使用 \d{2} 强制匹配2位数字，避免部分匹配
        const relaxedStandardPattern = /(20\d{2})[-\/](\d{1,2})[-\/](\d{2})(?:\s|$|来源|：|:|\D|\.)/
        m = text.match(relaxedStandardPattern)
        if (m) {
          const [, year, month, day] = m
          // 验证日期是否合理（1-31）
          const dayNum = parseInt(day, 10)
          if (dayNum >= 1 && dayNum <= 31) {
            const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            const ts = Date.parse(normalized)
            if (!Number.isNaN(ts)) {
              return ts  // 标准格式匹配成功，立即返回
            }
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
        
        // 不使用旧正则，因为旧正则会部分匹配（如匹配到 "2025/12/3" 而不是 "2025/12/31"）
        // 如果标准格式都匹配失败，返回 undefined，让调用方尝试其他方法
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

  // 过滤掉"工作动态"栏目标题
  const filtered = unique.filter(item => item.title.trim() !== "工作动态")
  return filtered
})


