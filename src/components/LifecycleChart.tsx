"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { StoredUpload } from "@/lib/storage";

interface Props {
  data: StoredUpload[];
}

const tooltipStyle = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 6,
  fontSize: 12,
  color: "#e6edf3",
};

export default function LifecycleChart({ data }: Props) {
  if (data.length < 2) {
    return (
      <div className="chart-container flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          需要至少 2 次上传才能显示生命周期曲线
        </p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.dateLabel,
    roi: +d.avgRoi.toFixed(2),
    cpm: +d.avgCpm.toFixed(2),
    orders: d.totalOrders,
  }));

  return (
    <div className="chart-container">
      <p className="section-title">生命周期曲线</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>ROI 走势</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6e7681" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6e7681" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={1} stroke="rgba(248,81,73,0.3)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="roi" stroke="#58a6ff" strokeWidth={2} dot={{ r: 3, fill: "#58a6ff" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>CPM 走势</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6e7681" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6e7681" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="cpm" stroke="#d29922" strokeWidth={2} dot={{ r: 3, fill: "#d29922" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>日订单走势</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.5)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6e7681" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6e7681" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="orders" stroke="#3fb950" strokeWidth={2} dot={{ r: 3, fill: "#3fb950" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>历史汇总</p>
          <p>累计上传：{data.length} 次</p>
          <p>峰值 ROI：{Math.max(...chartData.map((d) => d.roi)).toFixed(2)}</p>
          <p>峰值订单：{Math.max(...chartData.map((d) => d.orders))}</p>
          <p>最新 CPM：${chartData[chartData.length - 1].cpm.toFixed(2)}</p>
          <p>日期范围：{chartData[0].date} - {chartData[chartData.length - 1].date}</p>
        </div>
      </div>
    </div>
  );
}