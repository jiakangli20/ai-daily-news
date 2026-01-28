import { Agent, request } from "undici"

const DIFY_API_URL = process.env.DIFY_API_URL || "http://127.0.0.1/v1/workflows/run"
const DIFY_API_KEY = process.env.DIFY_API_KEY || "app-ZLSOQGiLvFpgTJnZVBOSiZAd"
const DIFY_TIMEOUT_MS = Number(process.env.DIFY_TIMEOUT_MS || 30 * 60 * 1000)

const difyAgent = new Agent({
  connectTimeout: Number(process.env.DIFY_CONNECT_TIMEOUT_MS || 60 * 1000),
  headersTimeout: DIFY_TIMEOUT_MS,
  bodyTimeout: DIFY_TIMEOUT_MS,
})

export interface DifyResponse {
  event: string
  task_id: string
  workflow_run_id: string
  data: {
    id: string
    workflow_id: string
    status: string
    outputs: {
      text?: string
    }
    error?: string
    elapsed_time: number
    total_tokens: number
    created_at: number
  }
}

export async function generateDailyReport(): Promise<string> {
  try {
    logger.info("开始调用 Dify 工作流生成日报...")

    if (!DIFY_API_KEY) {
      throw new Error("缺少 DIFY_API_KEY，请在环境变量中配置")
    }

    const body = JSON.stringify({
      inputs: {},
      response_mode: "blocking",
      user: "newsnow-daily",
    })

    const res = await request(DIFY_API_URL, {
      method: "POST",
      dispatcher: difyAgent,
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    })

    const responseText = await res.body.text()
    let response: {
      data: {
        outputs: {
          text: string
        }
        status: string
        error?: string
      }
    }
    try {
      response = JSON.parse(responseText)
    } catch {
      throw new Error(`Dify 响应不是合法 JSON (status=${res.statusCode}): ${responseText.slice(0, 500)}`)
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Dify HTTP 错误 (status=${res.statusCode}): ${responseText.slice(0, 500)}`)
    }

    // 检查工作流执行状态
    if (response.data.status !== "succeeded") {
      throw new Error(`Dify 工作流执行失败: ${response.data.error || "未知错误"}`)
    }

    // 获取 HTML 内容
    const htmlContent = response.data.outputs.text

    if (!htmlContent) {
      throw new Error("未能从 Dify 响应中提取 HTML 内容")
    }

    logger.success("Dify 工作流调用成功，已生成日报内容")
    return htmlContent
  } catch (error) {
    logger.error("调用 Dify 工作流失败:", error)
    throw error
  }
}
