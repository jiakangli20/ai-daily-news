import { ofetch } from "ofetch"

const DIFY_API_URL = "http://localhost/v1/workflows/run"
const DIFY_API_KEY = "app-Y0EazY7DVJ1uznmKEeJ7NtcO"

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

    const response = await ofetch<{
      data: {
        outputs: {
          html: string
        }
        status: string
        error?: string
      }
    }>(DIFY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: {
        inputs: {},
        response_mode: "blocking",
        user: "newsnow-daily",
      },
    })

    // 检查工作流执行状态
    if (response.data.status !== "succeeded") {
      throw new Error(`Dify 工作流执行失败: ${response.data.error || "未知错误"}`)
    }

    // 获取 HTML 内容
    const htmlContent = response.data.outputs.html

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
