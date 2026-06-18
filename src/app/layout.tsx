import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GMV Max 广告诊断工具",
  description: "基于 TikTok GMV Max 方法论的 AI 广告诊断工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
