import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useTitle } from "react-use"
import { ofetch } from "ofetch"
import "~/styles/daily.css"

export const Route = createFileRoute("/daily")({
  component: DailyComponent,
})

interface DailyReportList {
  years: Array<{
    year: string
    months: Array<{
      month: string
      days: string[]
    }>
  }>
}

interface DailyReport {
  date: string
  content: string
}

async function fetchDailyList(): Promise<DailyReportList> {
  const res = await ofetch<{ status: string, data: DailyReportList }>("/api/daily/list")
  return res.data
}

async function fetchDailyReport(date: string): Promise<DailyReport> {
  const res = await ofetch<{ status: string, data: DailyReport }>(`/api/daily/${date}`)
  return res.data
}

async function generateDailyReport(): Promise<void> {
  await ofetch("/api/daily/generate", { method: "POST" })
}

function DailyComponent() {
  useTitle("NewsNow | 日报")

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  const { data: listData, isLoading: isListLoading } = useQuery({
    queryKey: ["daily-list"],
    queryFn: fetchDailyList,
  })

  const { data: reportData, isLoading: isReportLoading } = useQuery({
    queryKey: ["daily-report", selectedDate],
    queryFn: () => fetchDailyReport(selectedDate!),
    enabled: !!selectedDate,
  })

  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    try {
      setIsGenerating(true)
      await generateDailyReport()
      // 刷新列表
      window.location.reload()
    } catch (error) {
      console.error("生成日报失败:", error)
      setIsGenerating(false)
    }
  }

  const toggleYear = (year: string) => {
    const newExpanded = new Set(expandedYears)
    if (newExpanded.has(year)) {
      newExpanded.delete(year)
    } else {
      newExpanded.add(year)
    }
    setExpandedYears(newExpanded)
  }

  const toggleMonth = (yearMonth: string) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(yearMonth)) {
      newExpanded.delete(yearMonth)
    } else {
      newExpanded.add(yearMonth)
    }
    setExpandedMonths(newExpanded)
  }

  useEffect(() => {
    if (listData?.years.length && !selectedDate) {
      const latestYear = listData.years[0]
      const latestMonth = latestYear.months[0]
      const latestDay = latestMonth.days[0]
      const date = `${latestYear.year}-${latestMonth.month}-${latestDay}`
      setSelectedDate(date)
      setExpandedYears(new Set([latestYear.year]))
      setExpandedMonths(new Set([`${latestYear.year}-${latestMonth.month}`]))
    }
  }, [listData, selectedDate])

  return (
    <div className="flex gap-6 h-[calc(100vh-200px)]">
      {/* 左侧日期选择器 */}
      <div
        className={$([
          "w-64 flex-shrink-0",
          "bg-primary/1 rounded-2xl p-4",
          "shadow shadow-primary/20",
          "overflow-y-auto",
        ])}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">日报列表</h2>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className={$([
              "px-3 py-1 rounded-lg text-sm",
              "bg-primary/10 hover:bg-primary/20",
              "transition-colors",
              isGenerating && "opacity-50 cursor-not-allowed",
            ])}
            title="生成今日日报"
          >
            {isGenerating ? "生成中..." : "生成"}
          </button>
        </div>

        {isListLoading
          ? (
              <div className="text-center py-8 text-sm op-50">加载中...</div>
            )
          : !listData?.years.length
              ? (
                  <div className="text-center py-8 text-sm op-50">暂无日报</div>
                )
              : (
                  <div className="space-y-2">
                    {listData.years.map(yearData => (
                      <div key={yearData.year}>
                        <button
                          type="button"
                          onClick={() => toggleYear(yearData.year)}
                          className={$([
                            "w-full text-left px-3 py-2 rounded-lg",
                            "hover:bg-primary/10 transition-colors",
                            "flex items-center gap-2",
                          ])}
                        >
                          <span className={$([
                            "i-ph:caret-right-duotone transition-transform",
                            expandedYears.has(yearData.year) && "rotate-90",
                          ])}
                          />
                          <span className="font-semibold">{yearData.year}</span>
                        </button>

                        {expandedYears.has(yearData.year) && (
                          <div className="ml-4 space-y-1">
                            {yearData.months.map((monthData) => {
                              const yearMonth = `${yearData.year}-${monthData.month}`
                              return (
                                <div key={yearMonth}>
                                  <button
                                    type="button"
                                    onClick={() => toggleMonth(yearMonth)}
                                    className={$([
                                      "w-full text-left px-3 py-1.5 rounded-lg",
                                      "hover:bg-primary/10 transition-colors",
                                      "flex items-center gap-2 text-sm",
                                    ])}
                                  >
                                    <span className={$([
                                      "i-ph:caret-right-duotone transition-transform text-xs",
                                      expandedMonths.has(yearMonth) && "rotate-90",
                                    ])}
                                    />
                                    <span>
                                      {monthData.month}
                                      月
                                    </span>
                                  </button>

                                  {expandedMonths.has(yearMonth) && (
                                    <div className="ml-4 space-y-0.5">
                                      {monthData.days.map((day) => {
                                        const date = `${yearData.year}-${monthData.month}-${day}`
                                        const isSelected = selectedDate === date
                                        return (
                                          <button
                                            key={day}
                                            type="button"
                                            onClick={() => setSelectedDate(date)}
                                            className={$([
                                              "w-full text-left px-3 py-1.5 rounded-lg",
                                              "transition-colors text-sm",
                                              isSelected
                                                ? "bg-primary/20 color-primary font-semibold"
                                                : "hover:bg-primary/10 op-70",
                                            ])}
                                          >
                                            {day}
                                            日
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
      </div>

      {/* 右侧内容区域 */}
      <div
        className={$([
          "flex-1",
          "bg-primary/1 rounded-2xl p-6",
          "shadow shadow-primary/20",
          "overflow-y-auto",
        ])}
      >
        {!selectedDate
          ? (
              <div className="flex items-center justify-center h-full text-sm op-50">
                请选择日期查看日报
              </div>
            )
          : isReportLoading
            ? (
                <div className="flex items-center justify-center h-full text-sm op-50">
                  加载中...
                </div>
              )
            : reportData
              ? (
                  <div>
                    <h1 className="text-2xl font-bold mb-6 pb-4 border-b border-primary/10">
                      {selectedDate}
                      {" "}
                      日报
                    </h1>
                    <div
                      className="daily-report-content"
                      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml
                      dangerouslySetInnerHTML={{ __html: reportData.content }}
                    />
                  </div>
                )
              : (
                  <div className="flex items-center justify-center h-full text-sm op-50">
                    加载失败
                  </div>
                )}
      </div>
    </div>
  )
}
