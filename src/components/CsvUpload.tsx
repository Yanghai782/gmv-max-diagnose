"use client";

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  classify,
  type ClassificationResult,
  type ClassifiedCreative,
} from "@/lib/classifier";

interface Props {
  breakevenROI: number;
  onDiagnoseCreative: (creative: ClassifiedCreative) => void;
}

export default function CsvUpload({ breakevenROI, onDiagnoseCreative }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            if (rows.length === 0) {
              setError("文件中没有数据行");
              setLoading(false);
              return;
            }
            const res = classify(headers, rows, breakevenROI);
            setResult(res);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "分类失败");
          }
          setLoading(false);
        },
        error: (err) => {
          setError(`CSV 解析错误：${err.message}`);
          setLoading(false);
        },
      });
    },
    [breakevenROI]
  );

  const parseExcel = useCallback(
    (buffer: ArrayBuffer, filename: string) => {
      try {
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(
          ws,
          { header: 1, defval: "" }
        );

        if (json.length < 2) {
          setError("文件至少需要包含表头和一行数据");
          setLoading(false);
          return;
        }

        const headers = (json[0] as (string | number | null)[]).map((h) =>
          String(h).trim()
        );
        const rows: Record<string, string>[] = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i] as (string | number | null)[];
          if (!row.some((c) => String(c).trim() !== "")) continue;
          const obj: Record<string, string> = {};
          headers.forEach((h, j) => {
            obj[h] = String(row[j] ?? "").trim();
          });
          rows.push(obj);
        }
        const res = classify(headers, rows, breakevenROI);
        setResult(res);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Excel 解析失败");
      }
      setLoading(false);
    },
    [breakevenROI]
  );

  const handleFile = useCallback(
    (file: File) => {
      setLoading(true);
      setError(null);
      setResult(null);

      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) {
            parseExcel(e.target.result, file.name);
          }
        };
        reader.onerror = () => {
          setError("文件读取失败");
          setLoading(false);
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === "string") {
            parseCSV(e.target.result, file.name);
          }
        };
        reader.onerror = () => {
          setError("文件读取失败");
          setLoading(false);
        };
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
    const csv =
      "\uFEFF状态,发布时间,作品ID,成本,曝光,CTR(%),CVR(%),订单数,总收入,ROI,触发规则,ABCD分类,操作建议\n" +
      result.creatives
        .map(
          (r) =>
            `${r.status},${r.pubTime},${r.vid},${r.spend.toFixed(2)},${r.imp},${r.ctr.toFixed(2)},${r.cvr.toFixed(2)},${r.conv},${r.gmv.toFixed(2)},${r.roi.toFixed(2)},"${r.rules.join(", ")}","${r.abcd}类","${r.actionText}"`
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GMV_MAX_素材诊断结果.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-green-500 bg-green-50"
            : "border-gray-300 hover:border-green-400 hover:bg-gray-50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-2xl mb-1">📂</div>
        <p className="text-sm font-medium text-gray-700">
          上传 CSV / XLSX 素材报表
        </p>
        <p className="text-xs text-gray-400 mt-1">
          拖拽文件到这里，或点击选择 · 支持 TikTok GMV MAX 导出格式
        </p>
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
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center text-sm text-gray-500 py-4">
          正在解析和分类...
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-white rounded-lg p-3 text-center border">
              <div className="text-xl font-bold text-blue-600">
                {result.total}
              </div>
              <div className="text-xs text-gray-500">素材总数</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border">
              <div className="text-xl font-bold text-green-600">
                {result.keeps}
              </div>
              <div className="text-xs text-gray-500">保留(A类)</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border">
              <div className="text-xl font-bold text-orange-600">
                {result.tests}
              </div>
              <div className="text-xs text-gray-500">加热测试(C类)</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border">
              <div className="text-xl font-bold text-purple-600">
                {result.reviews}
              </div>
              <div className="text-xs text-gray-500">待观察</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center border">
              <div className="text-xl font-bold text-red-600">
                {result.culls}
              </div>
              <div className="text-xs text-gray-500">建议剔除</div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto max-h-[50vh] rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-gray-900 text-white text-left">
                  <th className="px-2 py-1.5">作品 ID</th>
                  <th className="px-2 py-1.5">成本($)</th>
                  <th className="px-2 py-1.5">曝光</th>
                  <th className="px-2 py-1.5">CTR(%)</th>
                  <th className="px-2 py-1.5">CVR(%)</th>
                  <th className="px-2 py-1.5">订单数</th>
                  <th className="px-2 py-1.5">GMV($)</th>
                  <th className="px-2 py-1.5">ROI</th>
                  <th className="px-2 py-1.5">触发规则</th>
                  <th className="px-2 py-1.5">分类</th>
                  <th className="px-2 py-1.5">操作建议</th>
                </tr>
              </thead>
              <tbody>
                {result.creatives.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-2 py-1.5 font-medium max-w-[120px] truncate">
                      {r.vid}
                    </td>
                    <td className="px-2 py-1.5">{r.spend.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.imp.toLocaleString()}</td>
                    <td className="px-2 py-1.5">{r.ctr.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.cvr.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.conv}</td>
                    <td className="px-2 py-1.5">{r.gmv.toFixed(2)}</td>
                    <td
                      className={`px-2 py-1.5 font-semibold ${
                        r.roi >= breakevenROI
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {r.roi.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-red-500 text-[10px]">
                      {r.rules.join(", ") || "-"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.abcd === "A"
                            ? "bg-green-100 text-green-700"
                            : r.abcd === "B"
                            ? "bg-blue-100 text-blue-700"
                            : r.abcd === "C"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.abcd}类
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span
                          className={
                            r.verdict === "keep"
                              ? "text-green-600"
                              : r.verdict === "review"
                              ? "text-purple-600"
                              : "text-red-600"
                          }
                        >
                          {r.actionText}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDiagnoseCreative(r);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                          title="追问 AI 诊断该素材"
                        >
                          追问
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <button
              onClick={handleExport}
              className="text-xs px-4 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors"
            >
              导出判定结果 CSV
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">
            分类基于保本 ROI={breakevenROI} · 中位消耗=${result.medianSpend.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
