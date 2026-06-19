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
  const [planCreationDate, setPlanCreationDate] = useState("");
  const [targetROI, setTargetROI] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
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
                copy[copy.length - 1] = { ...last, content: last.content + delta };
                return copy;
              });
            }
          } catch { /* skip malformed chunks */ }
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

  const handleScriptGenerate = useCallback(
    (prompt: string) => {
      setInput(prompt);
      setTab("chat");
      setTimeout(() => {
        const sendBtn = document.querySelector('button.btn-primary.shrink-0') as HTMLButtonElement;
        if (sendBtn && prompt.trim()) sendBtn.click();
      }, 200);
    },
    []
  );

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
- CPA：$${creative.cpa.toFixed(2)}
- GPM：$${creative.gpm.toFixed(2)}
- 频次：${creative.frequency.toFixed(1)}
- 健康评分：${creative.healthScore}/100
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
    <div className="flex flex-col h-screen max-w-5xl mx-auto">
      <header className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border-default)" }}>
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>GMV Max 广告诊断</h1>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Powered by DeepSeek</p>
          </div>
          <div className="tabs">
            <button onClick={() => setTab("chat")} className={`tab ${tab === "chat" ? "active" : ""}`}>对话诊断</button>
            <button onClick={() => setTab("batch")} className={`tab ${tab === "batch" ? "active" : ""}`}>批量分类</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            保本ROI
            <input type="number" value={breakevenROI} onChange={(e) => setBreakevenROI(parseFloat(e.target.value) || 1.0)} step="0.1" min="0.1" className="w-16" />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            单价($)
            <input type="number" value={unitPrice || ""} onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)} step="0.01" min="0" placeholder="售价" className="w-16" />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            目标ROI
            <input type="number" value={targetROI || ""} onChange={(e) => setTargetROI(parseFloat(e.target.value) || 0)} step="0.1" min="0" placeholder="GMV MAX" className="w-16" />
          </label>
          <button onClick={() => { setMessages([]); setInput(""); }} className="btn btn-ghost btn-sm">清空对话</button>
        </div>
      </header>

      <div hidden={tab !== "chat"} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-20" style={{ color: "var(--text-tertiary)" }}>
              <p className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>GMV Max 广告诊断工具</p>
              <p className="text-sm">输入广告数据（消耗、ROI、CTR、CVR、订单数等），获取阶段判定和操作建议</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "msg-user" : "msg-assistant prose max-w-none"}`}>
                {msg.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || (loading && i === messages.length - 1 ? "思考中..." : "")}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--border-default)" }}>
          <div className="flex gap-2">
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="输入广告数据或诊断问题..." rows={2} disabled={loading}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={handleSubmit} disabled={loading || !input.trim()} className="btn btn-primary shrink-0">
              {loading ? "..." : "发送"}
            </button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>

      <div hidden={tab !== "batch"} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
              计划创建日
              <input type="date" value={planCreationDate} onChange={(e) => setPlanCreationDate(e.target.value)} />
            </label>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>用于判定阶段和学习进度</p>
          </div>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            上传 TikTok GMV MAX 素材报告，自动按 CTR/CVR/ROI/消耗进行 ABCD 四类分级
          </p>
          <div className="flex flex-wrap gap-2" style={{ fontSize: 12 }}>
            <span className="badge badge-a">A 保留加预算</span>
            <span className="badge badge-b">B 优化后保留</span>
            <span className="badge badge-c">C 加热测试</span>
            <span className="badge badge-d">D 直接关停</span>
            <span className="badge" style={{ background: "rgba(248,81,73,0.08)", color: "var(--accent-red)" }}>剔除: CTR{"<"}1% / CVR{"<"}1.5%</span>
          </div>
        </div>
        <CsvUpload unitPrice={unitPrice} breakevenROI={breakevenROI} planCreationDate={planCreationDate} targetROI={targetROI} onDiagnoseCreative={handleDiagnoseCreative} onScriptGenerate={handleScriptGenerate} />
      </div>
    </div>
  );
}
