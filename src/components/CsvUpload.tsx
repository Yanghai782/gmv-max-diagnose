"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  classify,
  type ClassificationResult,
  type ClassifiedCreative,
} from "@/lib/classifier";
import { saveUpload, getAllUploads, type StoredUpload } from "@/lib/storage";
import LifecycleChart from "@/components/LifecycleChart";

interface Props {
  breakevenROI: number;
  unitPrice: number;
  planCreationDate?: string;
  targetROI?: number;
  onDiagnoseCreative: (creative: ClassifiedCreative) => void;
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "var(--accent-green)" : score >= 40 ? "var(--accent-yellow)" : "var(--accent-red)";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold" style={{ color, minWidth: 28, fontVariantNumeric: "tabular-nums" }}>{score}</span>
      <div className="health-track flex-1" style={{ minWidth: 50 }}>
        <div className="health-fill" style={{ width: score + "%", background: color }} />
      </div>
    </div>
  );
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
        <span style={{ color: "var(--accent-blue)" }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

export default function CsvUpload({ breakevenROI, unitPrice, planCreationDate, targetROI, onDiagnoseCreative }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState<{headers: string[]; rows: Record<string,string>[]} | null>(null);
  const [scriptProduct, setScriptProduct] = useState("");
  const [showScriptInput, setShowScriptInput] = useState(false);
  const [history, setHistory] = useState<StoredUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllUploads().then(setHistory).catch(() => {});
  }, []);

  const parseCSV = useCallback(
    (text: string, filename: string) => {
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (papaResult) => {
          try {
            const headers = papaResult.meta.fields || [];
            const rows = papaResult.data.filter((r) =>
              Object.values(r).some((v) => v.trim() !== "")
            );
            if (rows.length === 0) { setError("文件中没有数据行"); setLoading(false); return; }
            setRawData({ headers, rows });
            const res = classify(headers, rows, breakevenROI, unitPrice, planCreationDate, targetROI);
            setResult(res);
            setError(null);
            (async () => {
              try {
                const upload: StoredUpload = {
                  id: res.total + "-" + Date.now(),
                  timestamp: Date.now(),
                  dateLabel: new Date().toISOString().slice(0, 10),
                  creativeCount: res.total,
                  totalOrders: res.totalOrders,
                  totalSpend: +res.creatives.reduce((s, c) => s + c.spend, 0).toFixed(2),
                  totalGmv: +res.creatives.reduce((s, c) => s + c.gmv, 0).toFixed(2),
                  avgRoi: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.roi, 0) / res.total : 0).toFixed(2),
                  avgCpm: +res.medianCpm.toFixed(2),
                  avgCtr: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.ctr, 0) / res.total : 0).toFixed(2),
                  avgCvr: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.cvr, 0) / res.total : 0).toFixed(2),
                  totalImp: res.creatives.reduce((s, c) => s + c.imp, 0),
                  summary: res.total + " 素材 | ROI均 " + (res.creatives.reduce((s, c) => s + c.roi, 0) / Math.max(res.total, 1)).toFixed(2) + " | " + res.culls + " 剔除",
                };
                await saveUpload(upload);
                const all = await getAllUploads();
                setHistory(all);
              } catch {}
            })();
          } catch (e) {
            setError(e instanceof Error ? e.message : "分类失败");
          }
          setLoading(false);
        },
        error: (err: Error) => {
          setError("CSV 解析错误：" + err.message);
          setLoading(false);
        },
      });
    },
    [breakevenROI, unitPrice, planCreationDate, targetROI]
  );

  const parseExcel = useCallback(
    (buffer: ArrayBuffer, filename: string) => {
      try {
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: "" });
        if (json.length < 2) { setError("文件至少需要表头 + 一行数据"); setLoading(false); return; }
        const headers = (json[0] as (string | number | null)[]).map((h) => String(h).trim());
        const rows: Record<string, string>[] = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i] as (string | number | null)[];
          if (!row.some((c) => String(c).trim() !== "")) continue;
          const obj: Record<string, string> = {};
          headers.forEach((h, j) => { obj[h] = String(row[j] ?? "").trim(); });
          rows.push(obj);
        }
        setRawData({ headers, rows });
        const res = classify(headers, rows, breakevenROI, unitPrice, planCreationDate, targetROI);
        setResult(res);
        setError(null);
        (async () => {
          try {
            const upload: StoredUpload = {
              id: res.total + "-" + Date.now(),
              timestamp: Date.now(),
              dateLabel: new Date().toISOString().slice(0, 10),
              creativeCount: res.total,
              totalOrders: res.totalOrders,
              totalSpend: +res.creatives.reduce((s, c) => s + c.spend, 0).toFixed(2),
              totalGmv: +res.creatives.reduce((s, c) => s + c.gmv, 0).toFixed(2),
              avgRoi: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.roi, 0) / res.total : 0).toFixed(2),
              avgCpm: +res.medianCpm.toFixed(2),
              avgCtr: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.ctr, 0) / res.total : 0).toFixed(2),
              avgCvr: +(res.total > 0 ? res.creatives.reduce((s, c) => s + c.cvr, 0) / res.total : 0).toFixed(2),
              totalImp: res.creatives.reduce((s, c) => s + c.imp, 0),
              summary: res.total + " 素材 | ROI均 " + (res.creatives.reduce((s, c) => s + c.roi, 0) / Math.max(res.total, 1)).toFixed(2) + " | " + res.culls + " 剔除",
            };
            await saveUpload(upload);
            const all = await getAllUploads();
            setHistory(all);
          } catch {}
        })();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Excel 解析失败");
      }
      setLoading(false);
    },
    [breakevenROI, unitPrice, planCreationDate, targetROI]
  );

  useEffect(() => {
    if (!rawData) return;
    try {
      const res = classify(rawData.headers, rawData.rows, breakevenROI, unitPrice, planCreationDate, targetROI);
      setResult(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分类失败");
    }
  }, [breakevenROI, unitPrice, rawData, planCreationDate, targetROI]);

  const handleFile = useCallback(
    (file: File) => {
      setLoading(true);
      setError(null);
      setResult(null);
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) parseExcel(e.target.result, file.name);
        };
        reader.onerror = () => { setError("文件读取失败"); setLoading(false); };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === "string") parseCSV(e.target.result, file.name);
        };
        reader.onerror = () => { setError("文件读取失败"); setLoading(false); };
        reader.readAsText(file);
      }
    },
    [parseCSV, parseExcel]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleExport = () => {
    if (!result) return;
    const BOM = "\uFEFF";
    const csv = BOM + "状态,发布时间,作品ID,成本,曝光,CTR(%),CVR(%),订单数,GMV,ROI,CPA,GPM,频次,CPM,CPM上限,CPM超限,年龄,健康评分,触发规则,ABCD分类,操作建议\n" +
      result.creatives.map((r) =>
        r.status + "," + r.pubTime + "," + r.vid + "," + r.spend.toFixed(2) + "," + r.imp + "," + r.ctr.toFixed(2) + "," + r.cvr.toFixed(2) + "," + r.conv + "," + r.gmv.toFixed(2) + "," + r.roi.toFixed(2) + "," + r.cpa.toFixed(2) + "," + r.gpm.toFixed(2) + "," + r.frequency.toFixed(1) + "," + (r.cpm > 0 ? r.cpm.toFixed(2) : "") + "," + (r.cpmLimit > 0 ? r.cpmLimit.toFixed(2) : "") + "," + (r.cpmExceeded ? "是" : "否") + "," + r.age + "," + r.healthScore + ",\"" + r.rules.join(", ") + "\"," + r.abcd + ",\"" + r.actionText + "\""
      ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GMV_MAX_素材诊断结果.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* AI Script Generator */}
      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "12px 16px" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>AI 脚本生成</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>输入产品名，AI 帮你生成 GMV Max 素材脚本</p>
          </div>
          <button onClick={() => setShowScriptInput(!showScriptInput)} className="btn btn-primary btn-sm">
            {showScriptInput ? "收起" : "生成脚本"}
          </button>
        </div>
        {showScriptInput && (
          <div className="flex gap-2 mt-3">
            <input type="text" value={scriptProduct} onChange={(e) => setScriptProduct(e.target.value)} placeholder="输入产品名称..." className="flex-1" />
            <button
              onClick={() => {
                if (!scriptProduct.trim()) return;
                const prompt = "为产品《" + scriptProduct + "》生成一套GMV Max素材方案：\n\n1. 时间范围建议（冷启几天？何时放量？）\n2. 一条15秒素材脚本（含开头Hook + 中间展示 + CTA）\n3. 三个不同的开头钩子方案\n\n请基于壹木行万里的GMV Max方法论给出建议。";
                const textarea = document.querySelector("textarea[placeholder*='广告数据']") as HTMLTextAreaElement;
                if (textarea) { textarea.value = prompt; textarea.dispatchEvent(new Event("input", { bubbles: true })); }
                setShowScriptInput(false);
                setScriptProduct("");
              }}
              disabled={!scriptProduct.trim()}
              className="btn btn-primary btn-sm"
            >
              生成并追问
            </button>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-xl mb-1">📨</div>
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>上传 CSV / XLSX 素材报告</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>拖拽文件到这里，或点击选择 · 支持 TikTok GMV MAX 导出格式</p>
        {result && (
          <p className="text-xs mt-2 font-medium" style={{ color: "var(--accent-green)" }}>
            ✓ 已解析 {result.total} 条素材
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-red">
          <div className="alert-dot" style={{ background: "var(--accent-red)" }} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-6 text-sm" style={{ color: "var(--text-tertiary)" }}>
          正在解析和分类...
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stage + Learning Progress */}
          <div className="stat-card" style={{ textAlign: "left" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`stage stage-${result.stage}`}>
                  {result.stage === "cold" ? "冷启期" : result.stage === "scaling" ? "放量期" : result.stage === "mature" ? "成熟期" : result.stage === "decline" ? "衰退期" : "学习中"} - {(result.stageText || "").split(" - ")[1] || result.stageText}
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  计划{result.planAge}天 | 日均{result.dailyAvgOrders.toFixed(1)}单 | 累计{result.totalOrders}单
                </span>
              </div>
              <span className={`badge ${result.learningComplete ? "badge-a" : "badge-c"}`}>
                {result.learningComplete ? "学习完成" : "学习中"}
              </span>
            </div>
            <ProgressBar
              pct={result.learningProgress}
              label={"学习进度 (" + result.totalOrders + "/50 单)"}
            />
            {result.estimatedDaysToComplete > 0 && (
              <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                预计还需 {result.estimatedDaysToComplete} 天完成学习
              </p>
            )}
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-8 gap-2">
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-blue)" }}>{result.total}</div><div className="stat-label">素材总数</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-green)" }}>{result.keeps}</div><div className="stat-label">保留(A类)</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-orange)" }}>{result.tests}</div><div className="stat-label">加热测试(C类)</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-purple)" }}>{result.reviews}</div><div className="stat-label">待观察</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-red)" }}>{result.culls}</div><div className="stat-label">建议剔除</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-red)" }}>{result.creatives.filter((r) => r.cpmExceeded).length}</div><div className="stat-label">CPM超限</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-yellow)" }}>${result.medianCpa.toFixed(2)}</div><div className="stat-label">中位CPA</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: "var(--accent-blue)" }}>${result.medianGpm.toFixed(2)}</div><div className="stat-label">中位GPM</div></div>
          </div>

          {/* Alerts */}
          {result.alerts.length > 0 && (
            <div className="space-y-1.5">
              <p className="section-title">自动告警灯</p>
              {result.alerts.map((a, i) => (
                <div key={i} className={`alert alert-${a.level}`}>
                  <div className="alert-dot" style={{ background: a.level === "red" ? "var(--accent-red)" : a.level === "yellow" ? "var(--accent-yellow)" : "var(--accent-green)" }} />
                  {a.text}
                </div>
              ))}
            </div>
          )}

          {/* CPA Alerts */}
          {result.cpaAlerts.length > 0 && (
            <div className="space-y-1.5">
              <p className="section-title">CPA 红线</p>
              {result.cpaAlerts.map((a, i) => (
                <div key={i} className={`alert alert-${a.level}`}>
                  <div className="alert-dot" style={{ background: a.level === "red" ? "var(--accent-red)" : "var(--accent-yellow)" }} />
                  {a.text}
                </div>
              ))}
            </div>
          )}

          {/* Frequency Alerts */}
          {result.freqAlerts.length > 0 && (
            <div className="space-y-1.5">
              <p className="section-title">频次监控</p>
              {result.freqAlerts.map((a, i) => (
                <div key={i} className={`alert alert-${a.level}`}>
                  <div className="alert-dot" style={{ background: a.level === "red" ? "var(--accent-red)" : "var(--accent-yellow)" }} />
                  {a.text}
                </div>
              ))}
            </div>
          )}

          {/* GPM Ranking */}
          {result.gpmRanking.length > 0 && (
            <div className="stat-card" style={{ textAlign: "left" }}>
              <p className="section-title">GPM 排名 (Top 10)</p>
              <div className="space-y-1">
                {result.gpmRanking.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1" style={{ borderBottom: "1px solid var(--border-muted)" }}>
                    <span style={{ color: "var(--text-tertiary)", width: 24 }}>#{i + 1}</span>
                    <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{r.vid}</span>
                    <span style={{ color: "var(--accent-green)", width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>GPM ${r.gpm.toFixed(2)}</span>
                    <span style={{ color: "var(--text-tertiary)", width: 70, textAlign: "right" }}>CTR {r.ctr.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Funnel */}
          {result.funnel && !result.funnel.summary.includes("健康") && (
            <div className="alert alert-yellow">
              <div className="alert-dot" style={{ background: "var(--accent-yellow)" }} />
              素材漏斗：{result.funnel.summary}
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="stat-card" style={{ textAlign: "left" }}>
              <p className="section-title">预算/操作建议</p>
              {result.suggestions.map((s, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {i + 1}. {s}
                </p>
              ))}
            </div>
          )}

          {/* Velocity */}
          {result.velocity && (
            <div className="stat-card" style={{ textAlign: "left" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="section-title">素材流速仪表盘</p>
                <span className={`badge ${result.velocity.aCount === 0 ? "badge-d" : result.velocity.replacementRatio > 0.5 ? "badge-c" : "badge-a"}`}>
                  {result.velocity.alert}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-bold" style={{ color: "var(--accent-green)" }}>{result.velocity.aCount}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>A类保留</div></div>
                <div><div className="text-lg font-bold" style={{ color: "var(--accent-red)" }}>{result.velocity.cullCount}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>待剔除</div></div>
                <div><div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{(result.velocity.replacementRatio * 100).toFixed(0)}%</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>淘汰率</div></div>
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="overflow-auto max-h-[50vh] rounded-lg" style={{ border: "1px solid var(--border-default)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>发布时间</th>
                  <th>作品ID</th>
                  <th>成本($)</th>
                  <th>曝光</th>
                  <th>CTR%</th>
                  <th>CVR%</th>
                  <th>订单数</th>
                  <th>GMV</th>
                  <th>ROI</th>
                  <th>CPA</th>
                  <th>GPM</th>
                  <th>频次</th>
                  <th>CPM</th>
                  <th>CPM上限</th>
                  <th>年龄</th>
                  <th style={{ width: 140 }}>健康评分</th>
                  <th>触发规则</th>
                  <th>分类</th>
                  <th>操作建议</th>
                </tr>
              </thead>
              <tbody>
                {result.creatives.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.pubTime || "-"}</td>
                    <td className="font-medium" style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{r.vid}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>${r.spend.toFixed(2)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{r.imp.toLocaleString()}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{r.ctr.toFixed(2)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{r.cvr.toFixed(2)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{r.conv}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>${r.gmv.toFixed(2)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.roi >= breakevenROI ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 600 }}>{r.roi.toFixed(2)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.cpaOverTarget ? "var(--accent-red)" : "var(--text-secondary)" }}>${r.cpa > 0 ? r.cpa.toFixed(2) : "-"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.gpm > 0 ? "var(--accent-green)" : "var(--text-tertiary)" }}>${r.gpm > 0 ? r.gpm.toFixed(2) : "-"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.freqWarning ? "var(--accent-yellow)" : "var(--text-secondary)", fontWeight: r.freqWarning ? 600 : 400 }}>
                      {r.frequency > 0 ? r.frequency.toFixed(1) : "-"}{r.freqWarning ? " ⚠" : ""}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.cpmExceeded ? "var(--accent-red)" : "var(--text-secondary)", fontWeight: r.cpmExceeded ? 600 : 400 }}>
                      {r.cpm > 0 ? r.cpm.toFixed(2) : "-"}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--text-tertiary)" }}>{r.cpmLimit > 0 ? r.cpmLimit.toFixed(2) : "-"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: r.stale ? "var(--accent-yellow)" : "var(--text-tertiary)", fontWeight: r.stale ? 600 : 400 }}>
                      {r.age > 0 ? r.age : "-"}{r.stale ? " ⚠" : ""}
                    </td>
                    <td><HealthBar score={r.healthScore} /></td>
                    <td style={{ fontSize: 10, color: "var(--accent-red)" }}>{r.rules.join(", ") || "-"}</td>
                    <td>
                      <span className={`badge badge-${r.abcd.toLowerCase()}`}>{r.abcd}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span style={{ fontSize: 11, color: r.verdict === "keep" ? "var(--accent-green)" : r.verdict === "review" ? "var(--accent-purple)" : "var(--accent-red)" }}>{r.actionText}</span>
                        <button onClick={(e) => { e.stopPropagation(); onDiagnoseCreative(r); }} className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", fontSize: 10 }} title="追问 AI 诊断">追问</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lifecycle Chart (#19) */}
          {history.length >= 2 && (
            <LifecycleChart data={history} />
          )}

          {/* Export */}
          <div className="flex justify-end">
            <button onClick={handleExport} className="btn btn-ghost">
              导出判定结果 CSV
            </button>
          </div>

          <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
            分类基于保本 ROI={breakevenROI} · 中位消耗=${result.medianSpend.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}