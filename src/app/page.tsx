"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CsvUpload from "@/components/CsvUpload";
import type { ClassifiedCreative } from "@/lib/classifier";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Tab = "chat" | "batch";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [breakevenROI, setBreakevenROI] = useState(3.0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const msgs = [...messages, userMsg];
    setMessages(msgs);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...msgs, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!response.ok) {
        const err = await response.json();
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `**错误**：${err.error || "请求失败"}`,
          };
          return copy;
        });
        setLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + delta,
                };
                return copy;
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `**网络错误**：${e instanceof Error ? e.message : "未知错误"}`,
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleDiagnoseCreative = useCallback(
    (creative: ClassifiedCreative) => {
      const prompt = `诊断这条 ${creative.abcd} 类素材：

- 作品 ID：${creative.vid}
- 成本：$${creative.spend.toFixed(2)}
- 曝光：${creative.imp.toLocaleString()}
- CTR：${creative.ctr.toFixed(2)}%
- CVR：${creative.cvr.toFixed(2)}%
- 订单数：${creative.conv}
- GMV：$${creative.gmv.toFixed(2)}
- ROI：${creative.roi.toFixed(2)}
- 触发规则：${creative.rules.join(", ") || "无"}
- 当前分类：${creative.abcd} 类 · ${creative.actionText}

请帮我深入分析这条素材，为什么会被分到 ${creative.abcd} 类？有什么优化建议？`;

      setInput(prompt);
      setTab("chat");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              GMV Max 广告诊断
            </h1>
            <p className="text-xs text-gray-500">Powered by DeepSeek</p>
          </div>
          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab("chat")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tab === "chat"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              对话诊断
            </button>
            <button
              onClick={() => setTab("batch")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tab === "batch"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              批量分类
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Breakeven ROI input */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            保本 ROI
            <input
              type="number"
              value={breakevenROI}
              onChange={(e) =>
                setBreakevenROI(parseFloat(e.target.value) || 1.0)
              }
              step="0.1"
              min="0.1"
              className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <button
            onClick={() => {
              setMessages([]);
              setInput("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            清空对话
          </button>
        </div>
      </header>

      {/* Content */}
      {tab === "chat" ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-20">
                <p className="text-lg font-medium mb-1">
                  GMV Max 广告诊断工具
                </p>
                <p className="text-sm">
                  输入广告数据（消耗、ROI、CTR、CVR、订单数等），获取阶段判定和操作建议
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900 prose prose-sm max-w-none prose-headings:text-gray-900 prose-table:text-sm prose-th:px-2 prose-td:px-2 prose-th:py-1 prose-td:py-1 prose-code:text-xs prose-code:bg-gray-200 prose-code:px-1 prose-code:rounded"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content ||
                        (loading && i === messages.length - 1
                          ? "思考中..."
                          : "")}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-gray-200 px-4 py-3 shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入广告数据或诊断问题..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !input.trim()}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "..." : "发送"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Enter 发送 · Shift+Enter 换行
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              上传 TikTok GMV MAX 素材报表，自动按 CTR/CVR/ROI/消耗 进行 ABCD 四类分级
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                A 保留加预算
              </span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                B 优化后保留
              </span>
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                C 加热测试
              </span>
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                D 直接关停
              </span>
              <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                剔除: CTR&lt;1% / CVR&lt;1.5%
              </span>
            </div>
          </div>
          <CsvUpload
            breakevenROI={breakevenROI}
            onDiagnoseCreative={handleDiagnoseCreative}
          />
        </div>
      )}
    </div>
  );
}
