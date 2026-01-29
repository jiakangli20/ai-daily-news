import { $fetch } from "ofetch"

interface WeiboRes {
  ok?: number
  data?: {
    cards?: Array<{
      card_type?: number
      card_group?: Array<{
        desc?: string
        scheme?: string
        actionlog?: {
          ext?: string
        }
        icon?: string
      }>
    }>
  }
  // 可能还有其他字段
  [key: string]: any
}

export default defineSource(async () => {
  try {
    // 先访问主页获取cookie，避免被反爬虫拦截
    try {
      await myFetch("https://m.weibo.cn/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0",
        },
      })
    } catch (e) {
      // 忽略错误，继续
    }

    // 获取cookie
    let cookie: string | undefined
    try {
      const rawResponse = await $fetch.raw("https://m.weibo.cn/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0",
        },
      })
      cookie = rawResponse.headers.getSetCookie().join("; ")
    } catch (e) {
      // 如果获取cookie失败，继续尝试
    }

    const url = "https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot"
    
    const headers: Record<string, string> = {
      "Referer": "https://m.weibo.cn/",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0",
    }
    
    if (cookie) {
      headers["Cookie"] = cookie
    }

    const res = await myFetch(url, { headers })

    // 检查返回的是否是HTML（被反爬虫拦截）
    if (typeof res === "string" && (res.trim().startsWith("<!DOCTYPE") || res.trim().startsWith("<html"))) {
      console.error("微博API: 返回HTML页面（可能被反爬虫拦截），无法获取数据")
      return []
    }

    // 如果不是对象，尝试解析JSON
    let data: WeiboRes
    if (typeof res === "string") {
      try {
        data = JSON.parse(res)
      } catch (e) {
        console.error("微博API: 无法解析JSON数据")
        return []
      }
    } else {
      data = res as WeiboRes
    }

    if (!data) {
      console.error("微博API: 返回数据为空")
      return []
    }

    // 调试：打印实际的返回数据结构
    console.log("微博API返回数据结构:", {
      hasOk: "ok" in data,
      ok: data.ok,
      hasData: "data" in data,
      dataKeys: data.data ? Object.keys(data.data) : [],
      cardsLength: data.data?.cards?.length || 0,
    })

    // 如果ok字段不存在或不为1，仍然尝试查找数据
    if (data.ok !== undefined && data.ok !== 1) {
      console.error("微博API: ok不等于1, ok=", data.ok)
      // 即使ok不为1，仍然尝试解析数据
    }

    if (!data.data) {
      console.error("微博API: data字段不存在")
      return []
    }

    if (!data.data.cards || data.data.cards.length === 0) {
      console.error("微博API: cards为空或不存在")
      return []
    }

    // 遍历所有cards，查找包含热搜数据的card
    const allItems: Array<{ id: string; title: string; url: string; mobileUrl?: string }> = []
    
    for (const card of data.data.cards) {
      if (card.card_group && card.card_group.length > 0) {
        const items = card.card_group
          .filter((k, _i) => {
            // 过滤掉没有desc的项和广告
            if (!k.desc) return false
            if (_i === 0) return false // 跳过第一项（通常是标题）
            if (k.actionlog?.ext?.includes("ads_word")) return false
            return true
          })
          .map((k) => {
            const keyword = k.desc!
            return {
              id: keyword,
              title: keyword,
              url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${keyword}#`)}&t=31&band_rank=1&Refer=top`,
              mobileUrl: k.scheme,
            }
          })
        
        if (items.length > 0) {
          allItems.push(...items)
        }
      }
    }

    // 如果找到数据，返回去重后的结果
    if (allItems.length > 0) {
      const uniqueItems = Array.from(
        new Map(allItems.map(item => [item.id, item])).values()
      )
      console.log(`微博API: 成功获取 ${uniqueItems.length} 条热搜`)
      return uniqueItems
    }

    console.error("微博API: 没有找到有效的热搜数据")
    return []
  } catch (error) {
    console.error("微博API请求异常:", error)
    return []
  }
})
