import * as cheerio from "cheerio"

/**
 * 苏州国资新闻爬虫
 * 从 https://guozw.suzhou.gov.cn/gzw/gzyw/olist.shtml 抓取国资要闻
 */
export default defineSource(async () => {
  // 要抓取的列表页URL列表（目前只有一个）
  const bases = [
    "https://guozw.suzhou.gov.cn/gzw/gzyw/olist.shtml",
  ]
  /**
   * 规范化日期字符串
   * 将各种日期格式（年、月、日、斜杠、点等）统一转换为标准格式
   * 例如："2025年10月29日" -> "2025-10-29"
   */
  function normalizeDateString(input: string) {
    const s = input
      .replace(/年|\.|\//g, "-")  // 将"年"、"."、"/"替换为"-"
      .replace(/月/g, "-")         // 将"月"替换为"-"
      .replace(/日/g, " ")         // 将"日"替换为空格
      .replace(/\s+/g, " ")        // 合并多个空格为一个
      .trim()                      // 去除首尾空格
    return s
  }

  /**
   * 从HTML元素中提取发布日期
   * 会尝试从链接元素的父级元素（通常是<li>）中查找日期信息
   * 支持的日期元素：span.time、time标签、span标签等
   */
  function extractDateFromElement(a: cheerio.Cheerio<any>) {
    const li = a.closest("li")  // 找到最近的父级<li>元素
    const candidates: string[] = []  // 候选日期文本列表
    
    if (li.length) {
      // 尝试从<li日期元素中获取日期文本>元素内的各种
      candidates.push(li.find("span.time").first().text())      // <span class="time">
      candidates.push(li.find("time").first().text())            // <time>标签
      candidates.push(li.find("span").last().text())             // 最后一个<span>
      candidates.push(li.find(".date, .time").first().text())    // .date或.time类
    }
    // 尝试从链接元素本身获取日期属性
    candidates.push(a.attr("data-time") || "")
    // 尝试从链接元素的父级元素中查找日期
    candidates.push(a.parent().find("time, .date, .time, span.time").first().text())

    // 日期匹配正则：优先匹配标准格式 YYYY-MM-DD，然后匹配其他格式
    // 标准格式正则：精确匹配 YYYY-MM-DD 格式（如 2025-12-31）
    const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/  // 标准格式：2025-12-31
    // 备用格式正则：匹配其他日期格式（如 YYYY年MM月DD日）
    const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])(?:[\s日T](?:[01]?\d|2[0-3])(?::[0-5]\d){0,2})?/
    
    // 遍历所有候选文本，尝试匹配日期
    for (const raw of candidates) {
      const text = (raw || "").trim()
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
        // 找到匹配的日期，规范化后转换为时间戳
        const normalized = normalizeDateString(m[0])
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) return ts  // 返回有效的时间戳
      }
    }
    return undefined  // 未找到有效日期
  }

  /**
   * 从URL路径中提取日期
   * URL格式：/gzw/gzyw/202510/xxx.shtml
   * 提取年份和月份，生成日期（日期默认为1号）
   */
  function extractDateFromUrl(url: string) {
    try {
      const u = new URL(url)
      const path = u.pathname
      // 匹配路径中的6位数字（年份4位+月份2位），如：202510
      const m = path.match(/\/gzw\/gzyw\/(\d{6})\//)
      if (m) {
        const dateStr = m[1]  // 例如："202510"
        const y = dateStr.substring(0, 4)   // 提取年份："2025"
        const mo = dateStr.substring(4, 6)  // 提取月份："10"
        // 生成日期（日期默认为1号）并转换为时间戳
        const ts = Date.parse(`${y}-${mo}-01`)
        if (!Number.isNaN(ts)) return ts
      }
    } catch {}
    return undefined
  }

  /**
   * 获取单个列表页的新闻数据
   * @param listUrl 列表页URL
   * @returns 新闻项数组
   */
  async function fetchOne(listUrl: string) {
    try {
      // 获取列表页HTML
      const html: string = await myFetch(listUrl)
      const $ = cheerio.load(html)  // 使用cheerio加载HTML

      // 定义多个CSS选择器，尝试匹配新闻链接
      // 苏州国资的新闻链接通常在 .infolist ul li.item a 中
      const selectors = [
        ".infolist ul li.item a",      // 主要选择器
        ".page-infolist ul li a",      // 备选选择器
        ".infolist li a",              // 备选选择器
        "ul.infolist li a",            // 备选选择器
        ".pagelist ul li a",           // 备选选择器
      ]
      const $links = $(selectors.join(", "))  // 查找所有匹配的链接
      const baseUrl = new URL(listUrl)        // 用于构建绝对URL

      // 遍历所有链接，提取新闻信息
      const items = $links
        .map((_, el) => {
          const a = $(el)
          const href = a.attr("href")?.trim()    // 获取链接地址
          let title = a.text().trim()            // 获取标题文本
          
          // 过滤无效链接
          if (!href || !title) return null
          if (href.startsWith("javascript") || href.startsWith("#")) return null
          
          // 清理标题中的多余空格
          title = title.replace(/\s+/g, " ")

          // 构建完整的URL（相对路径转绝对路径）
          const url = href.startsWith("http") ? href : new URL(href, baseUrl).toString()
          const u = new URL(url)
          
          // 域名验证：确保只抓取 guozw.suzhou.gov.cn 的新闻
          if (u.hostname !== "guozw.suzhou.gov.cn") return null
          
          // 路径验证：确保是 /gzw/gzyw/ 路径下的详情页，排除列表页
          const isContentPage = u.pathname.includes("/gzw/gzyw/") 
            && u.pathname.endsWith(".shtml") 
            && !/olist\.shtml$/.test(u.pathname)  // 排除列表页
          
          if (!isContentPage) return null
          
          // 提取发布日期：优先从元素中提取，如果失败则从URL中提取
          let pubDate = extractDateFromElement(a)
          if (!pubDate) pubDate = extractDateFromUrl(url)
          
          return {
            id: url,        // 使用URL作为唯一ID
            title,          // 新闻标题
            url,            // 新闻链接
            pubDate,        // 发布日期（时间戳，可选）
          }
        })
        .get()  // cheerio的map返回的是cheerio对象，需要用get()转为数组

      return items as { id: string; title: string; url: string; pubDate?: number }[]
    } catch {
      return []  // 出错时返回空数组
    }
  }

  // 并发获取所有列表页的数据
  const results = await Promise.all(bases.map(fetchOne))
  const merged = results.flat()  // 将多个数组合并为一个
  
  // 根据URL去重（使用Map保持唯一性）
  const unique = Array.from(new Map(merged.map(i => [i.id, i])).values())

  /**
   * 从新闻详情页获取发布日期
   * 对于列表页中无法提取到日期的新闻，会访问详情页尝试获取
   * @param url 新闻详情页URL
   * @returns 发布日期时间戳，如果获取失败返回undefined
   */
  async function fetchDetailPubDate(url: string) {
    try {
      const html: string = await myFetch(url)
      const $ = cheerio.load(html)
      
      // 尝试从详情页的日期元素中提取日期
      // 常见的日期选择器：.publish-time、.pubtime、.date、time
      const dateText = $(".publish-time, .pubtime, .date, time").first().text().trim()
      
      if (!dateText) return undefined

      // 优先尝试匹配标准格式 YYYY-MM-DD（使用 ^ 确保从开头匹配）
      const standardPattern = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/
      let m = dateText.match(standardPattern)
      if (m) {
        const [, year, month, day] = m
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) {
          return ts  // 标准格式匹配成功，立即返回
        }
      }
      
      // 如果标准格式不匹配，尝试其他格式
      const datePattern = /(20\d{2})[\-\.\/年](0?[1-9]|1[0-2])[\-\.\/月](0?[1-9]|[12]\d|3[01])/
      m = dateText.match(datePattern)
      if (m) {
        const normalized = normalizeDateString(m[0])
        const ts = Date.parse(normalized)
        if (!Number.isNaN(ts)) return ts
      }
    } catch {}
    return undefined
  }

  // 对于没有日期的新闻项，尝试从详情页获取日期
  const itemsWithoutDate = unique.filter(i => !i.pubDate)
  if (itemsWithoutDate.length > 0) {
    // 并发访问所有没有日期的详情页，获取日期
    const dates = await Promise.all(itemsWithoutDate.map(i => fetchDetailPubDate(i.url)))
    
    // 将获取到的日期填充回对应的新闻项
    dates.forEach((date, i) => {
      if (date) {
        itemsWithoutDate[i].pubDate = date
      }
    })
  }

  // 返回去重后的新闻列表
  return unique
})
