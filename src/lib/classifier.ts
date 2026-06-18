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
  cpm: number;
  cpa: number;   // CPA = spend / conv
  gpm: number;   // GPM = GMV / imp * 1000
  frequency: number; // frequency column
  play2s: number;
  play6s: number;
  play25p: number;
  play50p: number;
  play75p: number;
  play100p: number;
  status: string;
  raw: Record<string, string>;
}

export interface ClassifiedCreative extends CreativeRow {
  rules: string[];
  verdict: "keep" | "review" | "cull";
  abcd: "A" | "B" | "C" | "D";
  actionText: string;
  cpmLimit: number;
  cpmExceeded: boolean;
  age: number;
  stale: boolean;
  healthScore: number;  // 0-100
  cpaTrend: "up" | "stable" | "down" | "unknown";
  cpaOverTarget: boolean;
  freqWarning: boolean;
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
  unitPrice: number;
  medianCpm: number;
  medianCpmLimit: number;
  medianCpa: number;
  medianGpm: number;
  medianFrequency: number;
  stage: string;
  stageText: string;
  planAge: number;
  dailyAvgOrders: number;
  totalOrders: number;
  funnel: { hookWeak: boolean; bodyDrop: boolean; ctaMissing: boolean; summary: string } | null;
  learningComplete: boolean;
  learningProgress: number;
  estimatedDaysToComplete: number;
  alerts: { level: "red" | "yellow" | "green"; text: string }[];
  suggestions: string[];
  velocity: {
    aCount: number;
    cullCount: number;
    replacementRatio: number;
    alert: string;
  };
  cpaAlerts: { level: "red" | "yellow" | "green"; text: string }[];
  freqAlerts: { level: "red" | "yellow"; text: string }[];
  gpmRanking: { vid: string; gpm: number; ctr: number }[];
}

// Column name matching - supports TikTok export headers in Chinese and English
const COLUMN_PATTERNS: Record<string, string[][]> = {
  vid: [
    [
      "作品 id", "作品id", "作品", "video id", "creative id", "vid",
      "素材id", "素材 id", "素材编号", "素材编号id",
      "视频id", "视频 id", "视频编号", "创意id", "创意 id", "创意编号",
      "creativeid", "creative_id", "adcreativeid",
    ],
  ],
  spend: [["成本", "spend", "cost", "花费", "消耗", "支出"]],
  imp: [["商品广告曝光", "广告曝光", "impression", "展示", "曝光"]],
  ctr: [["商品广告点击率", "广告点击率", "点击率", "ctr"]],
  cvr: [["广告转化率", "转化率", "cvr"]],
  conv: [["sku 订单数", "订单数", "conversion", "转化数", "results", "purchase"]],
  gmv: [["总收入", "收入", "gmv", "成交额", "销售额", "交易额", "revenue"]],
  roi: [["roi", "roas", "产出比", "return"]],
  status: [["状态", "status"]],
  cpm: [["cpm", "千次展示成本", "千次成本", "千次展示花费"]],
  cpa: [["cpa", "单次转化成本", "单次成本", "转化成本"]],
  gpm: [["gpm", "千次展示收入", "千次收入", "千次展示gmv"]],
  frequency: [["frequency", "频次", "展示频次", "平均频次"]],
  play2s: [["2秒播放率", "2s播放率", "2秒播放", "2s播放"]],
  play6s: [["6秒播放率", "6s播放率", "6秒播放", "6s播放"]],
  play25p: [["25%播放", "25%播放率", "25播放率"]],
  play50p: [["50%播放", "50%播放率", "50播放率"]],
  play75p: [["75%播放", "75%播放率", "75播放率"]],
  play100p: [["100%播放", "100%播放率", "完播率", "完播"]],
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
function normalizeRate(raw: string | undefined): number {
  if (!raw) return 0;
  const str = raw.trim();
  const hasPercent = str.includes("%");
  const val = parseNumeric(str);
  if (hasPercent) return val;
  if (val > 0 && val <= 1) return val * 100;
  return val;
}

// Health Score: weighted 0-100 score per creative
function calcHealthScore(
  roi: number, breakevenROI: number,
  cpm: number, medianCpm: number,
  ctr: number, cvr: number,
  age: number, gpm: number, medianGpm: number
): number {
  let score = 0;
  if (roi > 0 && breakevenROI > 0) {
    const roiRatio = Math.min(roi / breakevenROI, 2);
    score += (roiRatio / 2) * 30;
  }
  if (cpm > 0 && medianCpm > 0) {
    const cpmRatio = Math.min(medianCpm / cpm, 2);
    score += (cpmRatio / 2) * 25;
  }
  score += Math.min(ctr / 2, 1) * 15;
  score += Math.min(cvr / 3, 1) * 15;
  score += Math.max(0, (14 - Math.min(age, 14)) / 14) * 10;
  if (gpm > 0 && medianGpm > 0) {
    score += Math.min(gpm / medianGpm, 2) / 2 * 5;
  }
  return Math.round(Math.min(score, 100));
}

export function classify(
  headers: string[],
  rows: Record<string, string>[],
  breakevenROI: number,
  unitPrice = 0,
  planCreationDate?: string,
  targetROI?: number
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
  const cpmCol = findColumn(headers, COLUMN_PATTERNS.cpm);
  const cpaCol = findColumn(headers, COLUMN_PATTERNS.cpa);
  const gpmCol = findColumn(headers, COLUMN_PATTERNS.gpm);
  const freqCol = findColumn(headers, COLUMN_PATTERNS.frequency);
  const play2sCol = findColumn(headers, COLUMN_PATTERNS.play2s);
  const play6sCol = findColumn(headers, COLUMN_PATTERNS.play6s);
  const play25pCol = findColumn(headers, COLUMN_PATTERNS.play25p);
  const play50pCol = findColumn(headers, COLUMN_PATTERNS.play50p);
  const play75pCol = findColumn(headers, COLUMN_PATTERNS.play75p);
  const play100pCol = findColumn(headers, COLUMN_PATTERNS.play100p);
  const hasFunnelData = !!(play2sCol || play100pCol);
  const pubCol = findColumn(headers, COLUMN_PATTERNS.pubTime);

  if (!vidCol || !spendCol) {
    throw new Error(
      `缺少必要列：${!vidCol ? "作品ID" : ""}${!vidCol && !spendCol ? "、" : ""}${!spendCol ? "成本/花费" : ""}`
    );
  }

  // Parse raw rows into CreativeRow
  const creatives: CreativeRow[] = rows.map((row) => {
    const spend = parseNumeric(row[spendCol!] || "0");
    const imp = parseInt(row[impCol || ""]) || 0;
    const conv = parseInt(row[convCol || ""]) || 0;
    const gmv = parseNumeric(row[gmvCol || ""] || "0");
    const currCpm = (() => {
      if (cpmCol && row[cpmCol]) {
        const v = parseNumeric(row[cpmCol]);
        if (v > 0) return v;
      }
      return imp > 0 ? spend / imp * 1000 : 0;
    })();
    const cpa = (cpaCol && row[cpaCol]) ? parseNumeric(row[cpaCol]) : (conv > 0 ? spend / conv : 0);
    const gpmVal = (gpmCol && row[gpmCol]) ? parseNumeric(row[gpmCol]) : (imp > 0 ? gmv / imp * 1000 : 0);
    const frequency = (freqCol && row[freqCol]) ? parseNumeric(row[freqCol]) : 0;

    return {
      pubTime: (row[pubCol || ""] || "").trim(),
      vid: (row[vidCol!] || "?").trim(),
      spend,
      imp,
      ctr: normalizeRate(row[ctrCol || ""]),
      cvr: normalizeRate(row[cvrCol || ""]),
      conv,
      gmv,
      roi: parseNumeric(row[roiCol || ""] || "0"),
      play2s: normalizeRate(row[play2sCol || ""]),
      play6s: normalizeRate(row[play6sCol || ""]),
      play25p: normalizeRate(row[play25pCol || ""]),
      play50p: normalizeRate(row[play50pCol || ""]),
      play75p: normalizeRate(row[play75pCol || ""]),
      play100p: normalizeRate(row[play100pCol || ""]),
      cpm: currCpm,
      cpa,
      gpm: gpmVal,
      frequency,
      status: (row[statusCol || ""] || "").trim(),
      raw: row,
    };
  });

  // Calculate median spend
  const spends = creatives
    .map((c) => c.spend)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  const medianSpend =
    spends.length > 0 ? spends[Math.floor(spends.length / 2)] : 10;

  // Calculate median CPM
  const cpms = creatives
    .map((c) => c.cpm)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianCpm =
    cpms.length > 0 ? cpms[Math.floor(cpms.length / 2)] : 0;

  // Calculate median CPA
  const cpas = creatives
    .map((c) => c.cpa)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianCpa =
    cpas.length > 0 ? cpas[Math.floor(cpas.length / 2)] : 0;

  // Calculate median GPM
  const gpms = creatives
    .map((c) => c.gpm)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianGpm =
    gpms.length > 0 ? gpms[Math.floor(gpms.length / 2)] : 0;

  // Calculate median Frequency
  const freqs = creatives
    .map((c) => c.frequency)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianFrequency =
    freqs.length > 0 ? freqs[Math.floor(freqs.length / 2)] : 0;

  // Calculate CPM limits
  const cpmLimits = creatives
    .map((c) => {
      if (unitPrice <= 0 || c.ctr <= 0 || c.cvr <= 0) return 0;
      return (unitPrice * (c.ctr / 100) * (c.cvr / 100) * 1000) / breakevenROI;
    })
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianCpmLimit =
    cpmLimits.length > 0 ? cpmLimits[Math.floor(cpmLimits.length / 2)] : 0;

  // Calculate creative ages
  const now = new Date();
  const calcAge = (pubTime: string): number => {
    if (!pubTime) return 0;
    try {
      const pub = new Date(pubTime);
      if (isNaN(pub.getTime())) return 0;
      return Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  // Classify each creative
  const classified: ClassifiedCreative[] = creatives.map((c) => {
    const rules: string[] = [];

    // Calculate CPM limit
    const cpmLimit = unitPrice > 0 && c.ctr > 0 && c.cvr > 0
      ? (unitPrice * (c.ctr / 100) * (c.cvr / 100) * 1000) / breakevenROI
      : 0;
    const cpmExceeded = cpmLimit > 0 && c.cpm > cpmLimit && c.cpm > 0;

    if (c.ctr > 0 && c.ctr < 1.0) rules.push("CTR<1%");
    if (c.cvr > 0 && c.cvr < 1.5) rules.push("CVR<1.5%");
    if (c.spend < 0.5 && c.conv === 0) rules.push("零消耗");
    if (c.roi > 0 && c.roi < breakevenROI) rules.push("ROI<保本");
    if (cpmExceeded) rules.push("CPM超上限");

    let verdict: "keep" | "review" | "cull" = "keep";
    let actionText = "保留继续跑";

    // CPM exceeded takes priority
    if (cpmExceeded) {
      verdict = "cull";
      actionText = "CPM超上限 直接关停";
    } else if (
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

    const age = calcAge(c.pubTime);
    const stale = age > 14;
    const cpaOverTarget = !!(c.cpa > 0 && targetROI && targetROI > 0 && c.cpa > targetROI);
    const cpaTrend: "up" | "stable" | "down" | "unknown" = "unknown";
    const freqWarning = c.frequency > 3;
    const healthScore = calcHealthScore(c.roi, breakevenROI, c.cpm, medianCpm, c.ctr, c.cvr, age, c.gpm, medianGpm);

    return { ...c, rules, verdict, abcd, actionText, cpmLimit, cpmExceeded, age, stale, healthScore, cpaTrend, cpaOverTarget, freqWarning };
  });

  const total = classified.length;
  const keeps = classified.filter(
    (r) => r.abcd === "A" || (r.verdict === "keep" && r.abcd !== "C")
  ).length;
  const tests = classified.filter((r) => r.abcd === "C").length;
  const culls = classified.filter((r) => r.verdict === "cull").length;
  const reviews = classified.filter((r) => r.verdict === "review").length;

  // Stage detection
  const totalOrders = classified.reduce((s, c) => s + c.conv, 0);
  let planAge = 0;
  if (planCreationDate) {
    try {
      const created = new Date(planCreationDate);
      if (!isNaN(created.getTime())) {
        planAge = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      }
    } catch {}
  }
  const dailyAvgOrders = planAge > 0 ? totalOrders / Math.max(planAge, 1) : totalOrders;

  let stage = "unknown";
  let stageText = "无法判定";
  if (planAge <= 7 && dailyAvgOrders < 5) {
    stage = "cold";
    stageText = "冷启期 - 系统学习中，不看ROI";
  } else if (dailyAvgOrders >= 30 && planAge > 7) {
    stage = "mature";
    stageText = "成熟期 - 稳定出单，管好素材库";
  } else if (dailyAvgOrders >= 5 && planAge > 7) {
    stage = "scaling";
    stageText = "放量期 - 逐步加预算，持续上新素材";
  } else if (planAge > 14 && dailyAvgOrders < 5) {
    stage = "decline";
    stageText = "衰退期 - 排查素材疲劳或产品周期";
  } else {
    stage = "learning";
    stageText = "学习中 - 数据不足，继续观察";
  }

  // Learning progress (NEW-E)
  const learningComplete = totalOrders >= 50;
  const learningProgress = Math.min((totalOrders / 50) * 100, 100);
  const estimatedDaysToComplete = dailyAvgOrders > 0 && totalOrders < 50
    ? Math.ceil((50 - totalOrders) / Math.max(dailyAvgOrders, 0.1))
    : 0;

  // Funnel analysis
  let funnel: { hookWeak: boolean; bodyDrop: boolean; ctaMissing: boolean; summary: string } | null = null;
  if (hasFunnelData) {
    const avg2s = creatives.reduce((s, c) => s + c.play2s, 0) / Math.max(total, 1);
    const avg6s = creatives.reduce((s, c) => s + c.play6s, 0) / Math.max(total, 1);
    const avg25p = creatives.reduce((s, c) => s + c.play25p, 0) / Math.max(total, 1);
    const avg50p = creatives.reduce((s, c) => s + c.play50p, 0) / Math.max(total, 1);
    const avg75p = creatives.reduce((s, c) => s + c.play75p, 0) / Math.max(total, 1);
    const avg100p = creatives.reduce((s, c) => s + c.play100p, 0) / Math.max(total, 1);

    const hookWeak = avg2s > 0 && avg2s < 25;
    const bodyDrop = avg2s > 0 && avg50p > 0 && (avg50p / Math.max(avg2s, 1)) < 0.3;
    const ctaMissing = avg50p > 0 && avg100p > 0 && (avg100p / Math.max(avg50p, 1)) < 0.3;

    const issues: string[] = [];
    if (hookWeak) issues.push("开头钩子弱(2s<25%)");
    if (bodyDrop) issues.push("中段流失严重");
    if (ctaMissing) issues.push("结尾CTA缺失");

    funnel = {
      hookWeak,
      bodyDrop,
      ctaMissing,
      summary: issues.length > 0 ? issues.join(" + ") : "素材漏斗健康",
    };
  }

  // #14 Auto Alerts
  const alerts: { level: "red" | "yellow" | "green"; text: string }[] = [];

  const staleCount = classified.filter((c) => c.stale).length;
  if (staleCount > 0) {
    alerts.push({
      level: staleCount > classified.length * 0.5 ? "red" : "yellow",
      text: `${staleCount}条素材年龄超过14天，建议迭代更新`,
    });
  }

  const cpmExceededCount = classified.filter((c) => c.cpmExceeded).length;
  if (cpmExceededCount > 0) {
    alerts.push({
      level: "red",
      text: `${cpmExceededCount}条素材CPM超上限，建议立即关停`,
    });
  }

  if (!learningComplete && totalOrders > 0) {
    alerts.push({
      level: totalOrders < 20 ? "yellow" : "green",
      text: `学习期：累计${totalOrders}单，需达到50单完成学习`,
    });
  } else if (learningComplete) {
    alerts.push({
      level: "green",
      text: `学习完成：${totalOrders}单，系统已稳定`,
    });
  }

  const cullRatio = culls / Math.max(total, 1);
  if (cullRatio > 0.5) {
    alerts.push({
      level: "red",
      text: `超过${(cullRatio * 100).toFixed(0)}%素材需剔除，建议大规模更换素材`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({ level: "green", text: "所有指标正常，素材库健康" });
  }

  // NEW-A: CPA alerts
  const cpaAlerts: { level: "red" | "yellow" | "green"; text: string }[] = [];
  const cpaHighCount = classified.filter((c) => c.cpa > 0 && medianCpa > 0 && c.cpa > medianCpa * 1.5).length;
  if (cpaHighCount > 0) {
    cpaAlerts.push({
      level: "yellow",
      text: `${cpaHighCount}条素材CPA偏高(>1.5x中位)，关注转化效率`,
    });
  }
  const cpaOverCount = classified.filter((c) => c.cpaOverTarget).length;
  if (cpaOverCount > 0 && targetROI && targetROI > 0) {
    cpaAlerts.push({
      level: "red",
      text: `${cpaOverCount}条素材CPA超过目标ROI换算上限，需降预算`,
    });
  }

  // NEW-C: Frequency alerts
  const freqAlerts: { level: "red" | "yellow"; text: string }[] = [];
  const freqHighCount = classified.filter((c) => c.freqWarning).length;
  if (freqHighCount > 0) {
    freqAlerts.push({
      level: freqHighCount > classified.length * 0.3 ? "red" : "yellow",
      text: `${freqHighCount}条素材频次>3，素材疲劳最早信号，比CPM上升更早发现衰退`,
    });
  }

  // NEW-B: GPM ranking (top 10 by GPM)
  const gpmRanking = classified
    .filter((c) => c.gpm > 0)
    .sort((a, b) => b.gpm - a.gpm)
    .slice(0, 10)
    .map((c) => ({ vid: c.vid, gpm: c.gpm, ctr: c.ctr }));

  // #17 Creative Velocity Dashboard
  const aCount = classified.filter((c) => c.abcd === "A").length;
  const cullCount2 = classified.filter((c) => c.verdict === "cull").length;
  const replacementRatio = total > 0 ? cullCount2 / total : 0;
  let velocityAlert = "素材流速正常";
  if (aCount === 0) velocityAlert = "无A类素材！需紧急上传新素材";
  else if (replacementRatio > 0.5) velocityAlert = "淘汰率高，新素材上线速度可能跟不上";
  else if (aCount < 3 && total > 10) velocityAlert = "A类素材不足，建议每周至少测出3条A类";

  // #15 Budget/Heating Suggestions
  const suggestions: string[] = [];
  const aCreatives = classified.filter((c) => c.abcd === "A");
  const cCreatives = classified.filter((c) => c.abcd === "C");

  if (aCreatives.length > 0) {
    suggestions.push(`A类素材(${aCreatives.length}条)：建议各加25%预算，2天后复查`);
  }
  if (cCreatives.length > 0) {
    suggestions.push(`C类素材(${cCreatives.length}条)：建议拉出加热测试，每条$15测1天`);
  }
  // GPM垫底建议
  if (gpmRanking.length > 0) {
    const bottom = gpmRanking[gpmRanking.length - 1];
    suggestions.push(`GPM垫底素材：${bottom.vid}(GPM=${bottom.gpm.toFixed(2)})，建议换新素材替换`);
  }
  if (suggestions.length === 0) {
    suggestions.push("当前无A/C类素材，建议先上传新素材测出优质素材");
  }

  return {
    creatives: classified,
    total,
    keeps,
    tests,
    culls,
    reviews,
    medianSpend,
    breakevenROI,
    unitPrice,
    medianCpm,
    medianCpmLimit,
    medianCpa,
    medianGpm,
    medianFrequency,
    stage,
    stageText,
    planAge,
    dailyAvgOrders,
    totalOrders,
    funnel,
    learningComplete,
    learningProgress,
    estimatedDaysToComplete,
    alerts,
    suggestions,
    velocity: {
      aCount,
      cullCount: cullCount2,
      replacementRatio,
      alert: velocityAlert,
    },
    cpaAlerts,
    freqAlerts,
    gpmRanking,
  };
}
