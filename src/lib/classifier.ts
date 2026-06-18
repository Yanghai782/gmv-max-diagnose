// ABCD classification engine for GMV Max creative diagnosis
// Based on the original GMVMAX_素材诊断台.html logic

export interface CreativeRow {
  pubTime: string;
  vid: string;
  spend: number;
  imp: number;
  ctr: number;   // percentage, e.g. 1.2 means 1.2%
  cvr: number;   // percentage
  conv: number;
  gmv: number;
  roi: number;
  status: string;
  raw: Record<string, string>;
}

export interface ClassifiedCreative extends CreativeRow {
  rules: string[];
  verdict: "keep" | "review" | "cull";
  abcd: "A" | "B" | "C" | "D";
  actionText: string;
}

export interface ClassificationResult {
  creatives: ClassifiedCreative[];
  total: number;
  keeps: number;
  tests: number;
  culls: number;
  reviews: number;
  medianSpend: number;
  breakevenROI: number;
}

// Column name matching - supports TikTok export headers in Chinese and English
const COLUMN_PATTERNS: Record<string, string[][]> = {
  vid: [
    ["作品 id", "作品id", "作品", "video id", "creative id", "vid", "素材id"],
  ],
  spend: [["成本", "spend", "cost", "花费", "消耗", "支出"]],
  imp: [["商品广告曝光", "广告曝光", "impression", "展示", "曝光"]],
  ctr: [["商品广告点击率", "广告点击率", "点击率", "ctr"]],
  cvr: [["广告转化率", "转化率", "cvr"]],
  conv: [["sku 订单数", "订单数", "conversion", "转化数", "results", "purchase"]],
  gmv: [["总收入", "收入", "gmv", "成交额", "销售额", "交易额", "revenue"]],
  roi: [["roi", "roas", "产出比", "return"]],
  status: [["状态", "status"]],
  pubTime: [["发布时间", "publish time"]],
};

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export function findColumn(
  headers: string[],
  patterns: string[][],
  excludePatterns?: string[][]
): string | null {
  outer: for (const header of headers) {
    const hl = normalizeStr(header);
    for (const group of patterns) {
      for (const pat of group) {
        if (hl.includes(normalizeStr(pat))) {
          if (excludePatterns) {
            for (const exGroup of excludePatterns) {
              for (const exPat of exGroup) {
                if (hl.includes(normalizeStr(exPat))) continue outer;
              }
            }
          }
          return header;
        }
      }
    }
  }
  return null;
}

function parseNumeric(val: string): number {
  const cleaned = val.replace(/[$,￥\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Normalize CTR/CVR value to percentage
// TikTok export formats vary: "1.2%", "0.012" (decimal), "1.2" (already %)
function normalizeRate(raw: string | undefined): number {
  if (!raw) return 0;
  const str = raw.trim();
  const hasPercent = str.includes("%");
  const val = parseNumeric(str);
  if (hasPercent) {
    // Already percentage with % sign, use as-is
    return val;
  }
  // If no % sign and value is in (0, 1], it's in decimal form (e.g. 0.012 = 1.2%)
  if (val > 0 && val <= 1) {
    return val * 100;
  }
  return val;
}

export function classify(
  headers: string[],
  rows: Record<string, string>[],
  breakevenROI: number
): ClassificationResult {
  // Match columns
  const vidCol = findColumn(headers, COLUMN_PATTERNS.vid);
  const spendCol = findColumn(headers, COLUMN_PATTERNS.spend);
  const impCol = findColumn(headers, COLUMN_PATTERNS.imp);
  const ctrCol = findColumn(headers, COLUMN_PATTERNS.ctr);
  const cvrCol = findColumn(headers, COLUMN_PATTERNS.cvr);
  const convCol = findColumn(headers, COLUMN_PATTERNS.conv);
  const gmvCol = findColumn(headers, COLUMN_PATTERNS.gmv);
  const roiCol = findColumn(headers, COLUMN_PATTERNS.roi);
  const statusCol = findColumn(headers, COLUMN_PATTERNS.status);
  const pubCol = findColumn(headers, COLUMN_PATTERNS.pubTime);

  if (!vidCol || !spendCol) {
    throw new Error(
      `缺少必要列：${!vidCol ? "作品ID" : ""}${!vidCol && !spendCol ? "、" : ""}${!spendCol ? "成本/花费" : ""}`
    );
  }

  // Parse raw rows into CreativeRow
  const creatives: CreativeRow[] = rows.map((row) => ({
    pubTime: (row[pubCol || ""] || "").trim(),
    vid: (row[vidCol!] || "?").trim(),
    spend: parseNumeric(row[spendCol!] || "0"),
    imp: parseInt(row[impCol || ""]) || 0,
    ctr: normalizeRate(row[ctrCol || ""]),
    cvr: normalizeRate(row[cvrCol || ""]),
    conv: parseInt(row[convCol || ""]) || 0,
    gmv: parseNumeric(row[gmvCol || ""] || "0"),
    roi: parseNumeric(row[roiCol || ""] || "0"),
    status: (row[statusCol || ""] || "").trim(),
    raw: row,
  }));

  // Calculate median spend
  const spends = creatives
    .map((c) => c.spend)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  const medianSpend =
    spends.length > 0 ? spends[Math.floor(spends.length / 2)] : 10;

  // Classify each creative
  const classified: ClassifiedCreative[] = creatives.map((c) => {
    const rules: string[] = [];

    if (c.ctr > 0 && c.ctr < 1.0) rules.push("CTR<1%");
    if (c.cvr > 0 && c.cvr < 1.5) rules.push("CVR<1.5%");
    if (c.spend < 0.5 && c.conv === 0) rules.push("零消耗");
    if (c.roi > 0 && c.roi < breakevenROI) rules.push("ROI<保本");

    let verdict: "keep" | "review" | "cull" = "keep";
    let actionText = "保留继续跑";

    if (
      rules.includes("CTR<1%") ||
      rules.includes("CVR<1.5%") ||
      rules.includes("零消耗")
    ) {
      verdict = "cull";
      actionText = "直接关停";
    } else if (rules.includes("ROI<保本")) {
      verdict = "review";
      actionText = "降预算观察2天";
    }

    const hiS = c.spend >= medianSpend;
    const hiR = c.roi >= breakevenROI;

    let abcd: "A" | "B" | "C" | "D";
    if (hiS && hiR) {
      abcd = "A";
      if (verdict === "keep") actionText = "保留+可加预算";
    } else if (hiS && !hiR) {
      abcd = "B";
      actionText = "优化素材后保留";
    } else if (!hiS && hiR) {
      abcd = "C";
      actionText = "拉出加热测试";
    } else {
      abcd = "D";
      verdict = "cull";
      if (!rules.includes("D类")) rules.push("D类");
      actionText = "直接关停";
    }

    return { ...c, rules, verdict, abcd, actionText };
  });

  const total = classified.length;
  const keeps = classified.filter(
    (r) => r.abcd === "A" || (r.verdict === "keep" && r.abcd !== "C")
  ).length;
  const tests = classified.filter((r) => r.abcd === "C").length;
  const culls = classified.filter((r) => r.verdict === "cull").length;
  const reviews = classified.filter((r) => r.verdict === "review").length;

  return {
    creatives: classified,
    total,
    keeps,
    tests,
    culls,
    reviews,
    medianSpend,
    breakevenROI,
  };
}
