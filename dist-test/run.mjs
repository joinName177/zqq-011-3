// verify-ordering.mts
import { writeFileSync, mkdirSync } from "fs";

// src/core/mood-ordering.ts
var ID_TIMESTAMP_PREFIX = /^rec-(\d+)-/;
function recordCreatedAt(record) {
  if (typeof record.createdAt === "number" && Number.isFinite(record.createdAt)) {
    return record.createdAt;
  }
  const match = ID_TIMESTAMP_PREFIX.exec(record.id);
  return match ? Number(match[1]) : 0;
}
function compareRecords(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const timeDiff = recordCreatedAt(a) - recordCreatedAt(b);
  if (timeDiff !== 0) return timeDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function sortRecords(records) {
  return [...records].sort(compareRecords);
}
function dedupeRecords(records) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}
function canonicalizeRecords(records) {
  return sortRecords(dedupeRecords(records));
}
function round1(value) {
  return Math.round(value * 10) / 10;
}
function pickDominantTag(orderedRecords) {
  const counts = /* @__PURE__ */ new Map();
  const firstOrder = /* @__PURE__ */ new Map();
  orderedRecords.forEach((record, index) => {
    counts.set(record.tag, (counts.get(record.tag) ?? 0) + 1);
    if (!firstOrder.has(record.tag)) firstOrder.set(record.tag, index);
  });
  let winner;
  for (const [tag, count] of counts) {
    if (winner === void 0) {
      winner = tag;
      continue;
    }
    const winnerCount = counts.get(winner);
    if (count > winnerCount || count === winnerCount && firstOrder.get(tag) < firstOrder.get(winner)) {
      winner = tag;
    }
  }
  return winner;
}
function mergeDay(dayDate, dayRecords) {
  const ordered = sortRecords(dayRecords);
  const representative = ordered[ordered.length - 1];
  const count = ordered.length;
  const average = (selector) => ordered.reduce((sum, record) => sum + selector(record), 0) / count;
  const tagCounts = {};
  for (const record of ordered) {
    tagCounts[record.tag] = (tagCounts[record.tag] ?? 0) + 1;
  }
  return {
    date: dayDate,
    tag: pickDominantTag(ordered) ?? representative.tag,
    tagCounts,
    intensity: round1(average((r) => r.intensity)),
    pressureHpa: Math.round(average((r) => r.pressureHpa)),
    temperatureC: Math.round(average((r) => r.temperatureC)),
    humidityPercent: Math.round(average((r) => r.humidityPercent)),
    windSpeedKmH: Math.round(average((r) => r.windSpeedKmH)),
    // 风向取代表记录（最新签到），不做角度平均，避免跨 0°/360° 的错误合成
    windDirectionDeg: representative.windDirectionDeg,
    windDirectionName: representative.windDirectionName,
    notes: ordered.map((r) => r.note),
    note: representative.note,
    recordCount: count,
    recordIds: ordered.map((r) => r.id),
    representativeId: representative.id
  };
}
function mergeByDay(records) {
  const canonical = canonicalizeRecords(records);
  const days2 = /* @__PURE__ */ new Map();
  for (const record of canonical) {
    const group = days2.get(record.date);
    if (group) group.push(record);
    else days2.set(record.date, [record]);
  }
  return [...days2.keys()].sort().map((dayDate) => mergeDay(dayDate, days2.get(dayDate)));
}

// src/core/meteorology-engine.ts
var TAG_METAS = {
  "\u6674\u7A7A\u4E07\u91CC": {
    tag: "\u6674\u7A7A\u4E07\u91CC",
    category: "sunny",
    defaultPressure: 1024,
    defaultTemp: 24,
    defaultHumidity: 45,
    icon: "\u2600\uFE0F",
    windDesc: "\u5FAE\u98CE\u62C2\u9762 \xB7 \u4E1C\u5357\u98CE 2\u7EA7",
    themeColor: "#ffb703"
  },
  "\u5FAE\u98CE\u7166\u6696": {
    tag: "\u5FAE\u98CE\u7166\u6696",
    category: "sunny",
    defaultPressure: 1018,
    defaultTemp: 22,
    defaultHumidity: 50,
    icon: "\u{1F324}\uFE0F",
    windDesc: "\u548C\u7166\u6696\u98CE \xB7 \u5357\u98CE 3\u7EA7",
    themeColor: "#fb8500"
  },
  "\u9634\u8F6C\u591A\u4E91": {
    tag: "\u9634\u8F6C\u591A\u4E91",
    category: "cloudy",
    defaultPressure: 1008,
    defaultTemp: 18,
    defaultHumidity: 65,
    icon: "\u26C5",
    windDesc: "\u9759\u98CE\u65E0\u5B9A\u5411 \xB7 \u6C14\u538B\u5E73\u7F13",
    themeColor: "#8ecae6"
  },
  "\u4F4E\u6C14\u538B\u5927\u96FE": {
    tag: "\u4F4E\u6C14\u538B\u5927\u96FE",
    category: "fog",
    defaultPressure: 998,
    defaultTemp: 14,
    defaultHumidity: 92,
    icon: "\u{1F32B}\uFE0F",
    windDesc: "\u65E0\u98CE\u51DD\u6EDE \xB7 \u80FD\u89C1\u5EA6\u4E0D\u8DB3",
    themeColor: "#6c757d"
  },
  "\u5C40\u90E8\u6709\u7126\u8651": {
    tag: "\u5C40\u90E8\u6709\u7126\u8651",
    category: "cloudy",
    defaultPressure: 992,
    defaultTemp: 26,
    defaultHumidity: 78,
    icon: "\u{1F326}\uFE0F",
    windDesc: "\u504F\u897F\u9635\u98CE 5\u7EA7 \xB7 \u6C14\u65CB\u5BF9\u6D41",
    themeColor: "#588157"
  },
  "\u6696\u6E7F\u6C14\u6D41\u8FC7\u5883": {
    tag: "\u6696\u6E7F\u6C14\u6D41\u8FC7\u5883",
    category: "rain",
    defaultPressure: 1002,
    defaultTemp: 25,
    defaultHumidity: 85,
    icon: "\u{1F327}\uFE0F",
    windDesc: "\u897F\u5357\u6E7F\u6DA6\u6C14\u6D41 4\u7EA7",
    themeColor: "#219ebc"
  },
  "\u7A81\u53D1\u96F7\u66B4": {
    tag: "\u7A81\u53D1\u96F7\u66B4",
    category: "storm",
    defaultPressure: 975,
    defaultTemp: 20,
    defaultHumidity: 95,
    icon: "\u26C8\uFE0F",
    windDesc: "\u5F3A\u70C8\u98D1\u7EBF \xB7 \u504F\u5317\u5F3A\u98CE 8\u7EA7",
    themeColor: "#7209b7"
  },
  "\u5BD2\u6F6E\u5927\u98CE": {
    tag: "\u5BD2\u6F6E\u5927\u98CE",
    category: "snow",
    defaultPressure: 1032,
    defaultTemp: -2,
    defaultHumidity: 30,
    icon: "\u2744\uFE0F",
    windDesc: "\u897F\u4F2F\u5229\u4E9A\u5E72\u51B7\u98CE 7\u7EA7",
    themeColor: "#023e8a"
  }
};
function createRecordFromTag(tag, intensity, note, dateStr) {
  const meta = TAG_METAS[tag] || TAG_METAS["\u9634\u8F6C\u591A\u4E91"];
  const pressureOffset = (5 - intensity) * 3;
  const pressureHpa = Math.max(960, Math.min(1045, meta.defaultPressure + pressureOffset));
  const tempOffset = (intensity - 5) * 1.2;
  const temperatureC = Math.round(meta.defaultTemp + tempOffset);
  const humidityPercent = Math.min(100, Math.max(20, meta.defaultHumidity + (intensity > 6 ? 10 : -5)));
  const windDirections = ["\u4E1C\u5317", "\u4E1C", "\u4E1C\u5357", "\u5357", "\u897F\u5357", "\u897F", "\u897F\u5317", "\u5317"];
  const dirIdx = Math.abs((tag.charCodeAt(0) + intensity) % 8);
  const windDirName = windDirections[dirIdx];
  const windDeg = dirIdx * 45;
  const windSpeed = 5 + intensity * 3.5;
  const createdAt = Date.now();
  return {
    id: `rec-${createdAt}-${Math.floor(Math.random() * 1e3)}`,
    createdAt,
    date: dateStr || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    tag,
    intensity,
    note: note.trim() || "\u5E73\u9759\u89C2\u6D4B\u8BB0\u5F55",
    pressureHpa,
    temperatureC,
    humidityPercent,
    windSpeedKmH: Math.round(windSpeed),
    windDirectionDeg: windDeg,
    windDirectionName: windDirName
  };
}
function evaluateSynopticSystem(records) {
  const sorted = canonicalizeRecords(records);
  const dailyMoods = mergeByDay(sorted);
  const currentRecord = sorted[sorted.length - 1] || createRecordFromTag("\u9634\u8F6C\u591A\u4E91", 5, "\u9ED8\u8BA4\u5929\u6C14");
  const totalPressure = dailyMoods.reduce((acc, day) => acc + day.pressureHpa, 0);
  const avgPressure = dailyMoods.length ? Math.round(totalPressure / dailyMoods.length) : currentRecord.pressureHpa;
  let equatorial = 0;
  let subTropical = 0;
  let subPolar = 0;
  let polarCold = 0;
  dailyMoods.forEach((day) => {
    if (day.pressureHpa >= 1020 && day.temperatureC > 15) subTropical++;
    else if (day.pressureHpa >= 1020 && day.temperatureC <= 10) polarCold++;
    else if (day.pressureHpa <= 995) subPolar++;
    else equatorial++;
  });
  const total = dailyMoods.length || 1;
  const zones = [
    {
      code: "Z-STH",
      name: "\u526F\u70ED\u5E26\u9AD8\u538B\u5E26\uFF08\u5FC3\u5883\u6674\u6717\u7A33\u5B9A\uFF09",
      psychologicalState: "\u7CBE\u529B\u5E73\u7A33\u3001\u79E9\u5E8F\u611F\u5145\u8DB3\u3001\u5FC3\u6001\u4ECE\u5BB9\u660E\u6717",
      pressureRange: "1018 ~ 1030 hPa",
      activeRatio: Math.round(subTropical / total * 100),
      status: subTropical >= total * 0.35 ? "dominant" : "active",
      description: "\u53D7\u53CD\u6C14\u65CB\u6C89\u964D\u6C14\u6D41\u63A7\u5236\uFF0C\u5929\u7A7A\u4E91\u91CF\u7A00\u5C11\uFF0C\u6CE8\u610F\u529B\u805A\u7126\uFF0C\u5185\u8017\u6781\u4F4E\u3002"
    },
    {
      code: "Z-EQU",
      name: "\u8D64\u9053\u4F4E\u538B\u69FD\uFF08\u5145\u6C9B\u5BF9\u6D41\u4E0E\u7075\u611F\uFF09",
      psychologicalState: "\u60C5\u7EEA\u654F\u611F\u3001\u7075\u611F\u6D8C\u52A8\u3001\u8F7B\u5FAE\u60C5\u7EEA\u8E81\u52A8",
      pressureRange: "1000 ~ 1015 hPa",
      activeRatio: Math.round(equatorial / total * 100),
      status: equatorial >= total * 0.35 ? "dominant" : "active",
      description: "\u5BF9\u6D41\u6D3B\u52A8\u65FA\u76DB\uFF0C\u60C5\u7EEA\u6C34\u6C7D\u5145\u6C9B\uFF0C\u5BB9\u6613\u4EA7\u751F\u5373\u5174\u8868\u8FBE\u6B32\u4E0E\u63A2\u7D22\u70ED\u60C5\u3002"
    },
    {
      code: "Z-SPL",
      name: "\u526F\u6781\u5730\u4F4E\u6C14\u538B\u5E26\uFF08\u4F4E\u843D\u6F6E\u6E7F\u963B\u6EDE\uFF09",
      psychologicalState: "\u60C5\u7EEA\u5185\u8017\u3001\u5C40\u90E8\u7126\u8651\u3001\u7CBE\u529B\u4F4E\u8C37\u671F",
      pressureRange: "970 ~ 998 hPa",
      activeRatio: Math.round(subPolar / total * 100),
      status: subPolar >= total * 0.35 ? "dominant" : "active",
      description: "\u6696\u51B7\u6C14\u56E2\u4EA4\u6C47\u5F62\u6210\u6301\u4E45\u950B\u9762\u96E8\u5E26\uFF0C\u60C5\u7EEA\u4E91\u5C42\u539A\u91CD\uFF0C\u9633\u5149\u7A7F\u900F\u529B\u51CF\u5F31\u3002"
    },
    {
      code: "Z-POL",
      name: "\u6781\u5730\u51B7\u9AD8\u538B\u533A\uFF08\u60C5\u611F\u51B7\u5374\u4E0E\u5C01\u95ED\uFF09",
      psychologicalState: "\u51B7\u6F20\u7406\u6027\u3001\u62D2\u7EDD\u793E\u4EA4\u3001\u81EA\u6211\u9632\u5FA1\u5F00\u542F",
      pressureRange: "1025 ~ 1045 hPa (\u4F4E\u6E29)",
      activeRatio: Math.round(polarCold / total * 100),
      status: polarCold >= total * 0.2 ? "dominant" : "receding",
      description: "\u6E29\u5EA6\u8DCC\u7834\u9632\u5FA1\u7EBF\uFF0C\u5730\u8868\u70ED\u91CF\u8FC5\u901F\u6563\u5931\uFF0C\u8868\u73B0\u4E3A\u60C5\u7EEA\u51B7\u6DE1\u4E0E\u6C89\u9ED8\u3002"
    }
  ];
  const recentDays = dailyMoods.slice(-7);
  const hasStorm = recentDays.some((day) => day.pressureHpa < 985);
  const TREND_THRESHOLD_HPA = 1;
  const trendDeltaHpa = recentDays.length >= 2 ? recentDays[recentDays.length - 1].pressureHpa - recentDays[0].pressureHpa : 0;
  const trendDirection = trendDeltaHpa > TREND_THRESHOLD_HPA ? "\u56DE\u5347" : trendDeltaHpa < -TREND_THRESHOLD_HPA ? "\u4E0B\u884C" : "\u5E73\u7A33";
  let vectorName = "\u4E1C\u4E9A\u6E29\u548C\u504F\u5357\u5B63\u98CE";
  let originSource = "\u6765\u81EA\u751F\u6D3B\u65E5\u5E38\u4E0E\u9002\u5EA6\u793E\u4EA4\u6E29\u548C\u6C14\u56E2";
  let flowSpeed = "\u5FAE\u98CE 12 km/h";
  let windAngle = 135;
  let weatherImpact = "\u6C14\u538B\u5E73\u8861\uFF0C\u60C5\u7EEA\u7CFB\u7EDF\u5904\u4E8E\u8212\u9002\u81EA\u51C0\u533A\u95F4";
  let upcomingForecast = "\u9884\u8BA1\u672A\u6765\u4E09\u5929\u65E0\u660E\u663E\u51B7\u7A7A\u6C14\u5165\u4FB5\uFF0C\u7EF4\u6301\u591A\u4E91\u8F6C\u6674\u8D8B\u52BF\u3002";
  if (avgPressure < 995 || hasStorm) {
    vectorName = "\u897F\u5357\u70ED\u5E26\u6C14\u65CB\u9006\u65F6\u9488\u5207\u53D8\u6D41";
    originSource = "\u6765\u81EA\u591A\u91CD\u5F85\u529E\u4EFB\u52A1\u4E0E\u793E\u4EA4\u8FC7\u8F7D\u7684\u6DF1\u5C42\u70ED\u4F4E\u538B";
    flowSpeed = "\u75BE\u98CE 48 km/h";
    windAngle = 225;
    weatherImpact = "\u5E26\u6765\u95F4\u6B47\u6027\u7126\u8651\u964D\u6C34\u4E0E\u60C5\u7EEA\u98D1\u7EBF\uFF0C\u5FC3\u7406\u6E7F\u5EA6\u9AD8\u5C45\u4E0D\u4E0B";
    upcomingForecast = "\u8B66\u60D5\u60C5\u7EEA\u4E8C\u6B21\u5BF9\u6D41\u53CD\u5F39\uFF0C\u5EFA\u8BAE\u5C3D\u65E9\u542F\u52A8\u9632\u707E\u907F\u96E8\u9632\u5FA1\u3002";
  } else if (avgPressure > 1020) {
    vectorName = "\u9AD8\u538B\u810A\u5E73\u76F4\u897F\u98CE\u6C14\u6D41";
    originSource = "\u6765\u81EA\u575A\u5B9E\u751F\u6D3B\u79E9\u5E8F\u4E0E\u4E13\u6CE8\u5DE5\u4F5C\u5E26\u6765\u7684\u7A33\u5B9A\u53CD\u6C14\u65CB";
    flowSpeed = "\u6E05\u98CE 18 km/h";
    windAngle = 270;
    weatherImpact = "\u89C6\u754C\u6E05\u6670\u65E0\u4E91\uFF0C\u60C5\u7EEA\u80FD\u89C1\u5EA6\u6781\u9AD8\uFF0C\u9002\u5408\u89C4\u5212\u957F\u671F\u6218\u7565";
    upcomingForecast = "\u9AD8\u538B\u7CFB\u7EDF\u7A33\u5B9A\uFF0C\u6C14\u6E29\u5B9C\u4EBA\uFF0C\u5EFA\u8BAE\u4FDD\u6301\u5F53\u524D\u751F\u6D3B\u8282\u5F8B\u3002";
  }
  const monsoon = {
    vectorName,
    originSource,
    frequencyDays: recentDays.length,
    flowSpeed,
    windAngle,
    weatherImpact,
    upcomingForecast,
    trendDirection,
    trendDeltaHpa
  };
  const alerts = [];
  const lastRecord = currentRecord;
  if (lastRecord.pressureHpa < 980 || lastRecord.tag === "\u7A81\u53D1\u96F7\u66B4" && lastRecord.intensity >= 8) {
    alerts.push({
      id: "alert-red-storm",
      level: "\u7EA2\u8272",
      type: "\u60C5\u7EEA\u7279\u5927\u66B4\u96E8\u4E0E\u96F7\u7535\u66B4\u98CE\u9884\u8B66",
      title: "\u7EA2\u8272\u66B4\u96E8\u9884\u8B66 \xB7 \u60C5\u7EEA\u8D85\u8D1F\u8377\u5BF9\u6D41",
      issuedTime: lastRecord.date,
      triggerCause: `\u4E2D\u5FC3\u6C14\u538B\u964D\u81F3 ${lastRecord.pressureHpa}hPa\uFF0C\u9635\u98CE\u8D85\u901F\uFF0C\u5C40\u90E8\u5FC3\u7406\u964D\u6C34\u91CF\u8FBE\u7279\u5927\u66B4\u96E8\u7EA7\u522B\u3002`,
      defenseProtocol: [
        "\u7ACB\u5373\u6682\u505C\u6240\u6709\u9AD8\u6469\u64E6\u9AD8\u98CE\u9669\u7684\u4EBA\u9645\u6C9F\u901A\u4E0E\u51B3\u7B56\u3002",
        "\u9000\u56DE\u7269\u7406\u5B89\u5168\u533A\uFF08\u5367\u5BA4/\u5B89\u9759\u89D2\u843D\uFF09\uFF0C\u62C9\u4E0A\u7A97\u5E18\u5207\u65AD\u8FC7\u591A\u58F0\u5149\u523A\u6FC0\u3002",
        "\u8FDB\u884C5\u6B21\u6DF1\u957F\u8179\u5F0F\u547C\u5438\uFF0C\u5141\u8BB8\u773C\u6CEA\u6216\u503E\u8BC9\u4F5C\u4E3A\u81EA\u7136\u6C34\u6C7D\u91CA\u653E\u3002",
        "\u5907\u7528\u5E94\u6025\u70ED\u996E\uFF08\u70ED\u725B\u5976\u6216\u6D0B\u7518\u83CA\u8336\uFF09\uFF0C\u7B49\u5F85\u6C14\u65CB\u4E2D\u5FC3\u79FB\u51FA\u3002"
      ]
    });
  } else if (lastRecord.tag === "\u5C40\u90E8\u6709\u7126\u8651" && lastRecord.intensity >= 7) {
    alerts.push({
      id: "alert-orange-anxiety",
      level: "\u6A59\u8272",
      type: "\u5E72\u70ED\u9AD8\u6E29\u4E0E\u5F3A\u5BF9\u6D41\u7126\u8651\u9884\u8B66",
      title: "\u6A59\u8272\u9884\u8B66 \xB7 \u5C40\u90E8\u7126\u8651\u6C14\u56E2\u76D8\u65CB",
      issuedTime: lastRecord.date,
      triggerCause: `\u5FC3\u7406\u6E7F\u5EA6\u9AD8\u8FBE ${lastRecord.humidityPercent}%\uFF0C\u5185\u70ED\u79EF\u84C4\uFF0C\u51FA\u73B0\u660E\u663E\u5FC3\u7387\u8FC7\u8F7D\u4E0E\u601D\u7EEA\u4E71\u6D41\u3002`,
      defenseProtocol: [
        "\u6267\u884C\u201C\u6CE8\u610F\u529B\u7269\u7406\u964D\u6E29\u201D\uFF1A\u79BB\u5F00\u53D1\u751F\u7126\u8651\u7684\u5DE5\u4F4D\uFF0C\u6B65\u884C\u6D17\u8138\u6216\u51B7\u6C34\u6D17\u624B\u3002",
        "\u5C06\u8111\u4E2D\u76D8\u65CB\u7684\u6240\u6709\u5F85\u529E\u4E8B\u9879\u5199\u5728\u7EB8\u4E0A\uFF0C\u5173\u505C\u540E\u53F0\u5927\u8111\u7EBF\u7A0B\u3002",
        "\u7981\u6B62\u5728\u5F53\u591C\u8FDB\u884C\u81EA\u6211\u590D\u76D8\u6216\u6279\u5224\uFF0C\u63A8\u8FDF\u81F3\u660E\u65E9\u9AD8\u538B\u56DE\u5347\u540E\u518D\u8BAE\u3002"
      ]
    });
  } else if (lastRecord.tag === "\u5BD2\u6F6E\u5927\u98CE") {
    alerts.push({
      id: "alert-yellow-cold",
      level: "\u9EC4\u8272",
      type: "\u60C5\u611F\u5BD2\u6F6E\u4E0E\u793E\u4EA4\u51B0\u5C01\u9884\u8B66",
      title: "\u9EC4\u8272\u9884\u8B66 \xB7 \u6781\u5730\u5E72\u51B7\u51B7\u950B\u538B\u5883",
      issuedTime: lastRecord.date,
      triggerCause: `\u6C14\u6E29\u5267\u70C8\u9AA4\u964D\u81F3 ${lastRecord.temperatureC}\xB0C\uFF0C\u60C5\u7EEA\u80FD\u91CF\u8D8B\u8FD1\u51B0\u70B9\uFF0C\u9632\u5FA1\u6027\u575A\u51B0\u5F62\u6210\u3002`,
      defenseProtocol: [
        "\u4E0D\u5FC5\u5F3A\u8FEB\u81EA\u5DF1\u70ED\u60C5\u56DE\u5E94\u5916\u754C\u4FE1\u606F\uFF0C\u5F00\u542F\u793E\u4EA4\u8BF7\u5047\u6761/\u514D\u6253\u6270\u6A21\u5F0F\u3002",
        "\u901A\u8FC7\u70ED\u6C64\u3001\u6696\u6C34\u888B\u3001\u539A\u6BEF\u5B50\u63D0\u4F9B\u57FA\u7840\u8EAF\u4F53\u70ED\u91CF\u3002",
        "\u503E\u542C\u767D\u566A\u97F3\u6216\u91CD\u6E29\u4E00\u90E8\u719F\u6089\u7684\u7AE5\u5E74\u6CBB\u6108\u8001\u7535\u5F71\u3002"
      ]
    });
  }
  let pressureSystemType = "\u6E29\u5E26\u53CD\u6C14\u65CB\u5E73\u7A33";
  if (avgPressure >= 1020) pressureSystemType = "\u526F\u70ED\u5E26\u9AD8\u538B\u6674\u7A7A";
  else if (avgPressure < 990) pressureSystemType = "\u5F3A\u70C8\u51B7\u6DA1\u65CB";
  else if (alerts.length > 0) pressureSystemType = "\u950B\u9762\u6C14\u65CB\u591A\u53D8";
  else pressureSystemType = "\u6DF1\u69FD\u4F4E\u6C14\u538B\u9634\u973E";
  const trendText = `\u8FD1 7 \u65E5\u6C14\u538B${trendDirection === "\u5E73\u7A33" ? "\u57FA\u672C\u6301\u5E73" : `\u8F83\u5468\u521D${trendDirection} ${Math.abs(trendDeltaHpa)} hPa`}`;
  return {
    chartId: `SYN-${Date.now().toString(36).toUpperCase()}`,
    generatedDate: (/* @__PURE__ */ new Date()).toLocaleDateString("zh-CN"),
    currentRecord,
    records: sorted,
    sortedRecords: sorted,
    dailyMoods,
    recordCount: sorted.length,
    averagePressure: avgPressure,
    zones,
    monsoon,
    alerts,
    pressureSystemType,
    metSummary: `\u6C14\u8C61\u7EFC\u89C2\u663E\u793A\uFF1A\u5F53\u524D\u5FC3\u5883\u9886\u7A7A\u53D7\u3010${pressureSystemType}\u3011\u7EDF\u5FA1\u3002\u5168\u5468\u671F\u65E5\u5747\u6C14\u538B ${avgPressure} hPa\uFF0C\u8FD1\u671F\u4E3B\u8981\u53D7\u3010${monsoon.vectorName}\u3011\u5F71\u54CD\uFF0C${trendText}\u3002${alerts.length > 0 ? `\u5F53\u524D\u6302\u8D77 ${alerts.length} \u4E2A\u707E\u5BB3\u6027\u6C14\u8C61\u9884\u8B66\uFF01` : "\u6574\u5C42\u5927\u6C14\u73AF\u6D41\u5E73\u7A33\uFF0C\u65E0\u7834\u574F\u6027\u5BF9\u6D41\u3002"}`
  };
}

// src/core/mood-summary.ts
function summarizeMood(records) {
  const sorted = canonicalizeRecords(records);
  const dailyMoods = mergeByDay(sorted);
  const count = dailyMoods.length;
  const recordCount = sorted.length;
  const averageIntensity = count ? round1(dailyMoods.reduce((sum, day) => sum + day.intensity, 0) / count) : 0;
  const tags = [];
  const dayCounts = /* @__PURE__ */ new Map();
  const firstDayOrder = /* @__PURE__ */ new Map();
  dailyMoods.forEach((day, index) => {
    if (!tags.includes(day.tag)) tags.push(day.tag);
    dayCounts.set(day.tag, (dayCounts.get(day.tag) ?? 0) + 1);
    if (!firstDayOrder.has(day.tag)) firstDayOrder.set(day.tag, index);
  });
  let dominant = "\u6682\u65E0";
  for (const [tag, dayCount] of dayCounts) {
    if (dominant === "\u6682\u65E0") {
      dominant = tag;
      continue;
    }
    const currentCount = dayCounts.get(dominant);
    if (dayCount > currentCount || dayCount === currentCount && firstDayOrder.get(tag) < firstDayOrder.get(dominant)) {
      dominant = tag;
    }
  }
  return { count, recordCount, averageIntensity, tags, dominant, dailyMoods };
}

// src/core/mood-export.ts
function buildExportPayload(chart) {
  const summary = summarizeMood(chart.sortedRecords);
  return {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary,
    averagePressure: chart.averagePressure,
    trendDirection: chart.monsoon.trendDirection,
    trendDeltaHpa: chart.monsoon.trendDeltaHpa,
    dailyMoods: chart.dailyMoods,
    records: chart.sortedRecords
  };
}
function exportMoodJson(chart) {
  return JSON.stringify(buildExportPayload(chart), null, 2);
}
function csvEscape(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function exportMoodCsv(chart) {
  const header = [
    "\u65E5\u671F",
    "\u4E3B\u5BFC\u60C5\u7EEA",
    "\u5F53\u65E5\u8BB0\u5F55\u6570",
    "\u5E73\u5747\u5F3A\u5EA6",
    "\u5E73\u5747\u6C14\u538B(hPa)",
    "\u5E73\u5747\u6E29\u5EA6(\xB0C)",
    "\u5E73\u5747\u6E7F\u5EA6(%)",
    "\u5E73\u5747\u98CE\u901F(km/h)",
    "\u98CE\u5411",
    "\u6C14\u538B\u8D8B\u52BF(\u8FD17\u65E5)",
    "\u53C2\u4E0E\u5408\u5E76\u8BB0\u5F55ID",
    "\u5F53\u65E5\u5168\u90E8\u5907\u6CE8"
  ];
  const { trendDirection, trendDeltaHpa } = chart.monsoon;
  const trendText = `${trendDirection}(${trendDeltaHpa >= 0 ? "+" : ""}${trendDeltaHpa}hPa)`;
  const rows = chart.dailyMoods.map((day) => [
    day.date,
    day.tag,
    day.recordCount,
    day.intensity,
    day.pressureHpa,
    day.temperatureC,
    day.humidityPercent,
    day.windSpeedKmH,
    day.windDirectionName,
    trendText,
    day.recordIds.join(" "),
    day.notes.join(" / ")
  ].map(csvEscape).join(","));
  return "\uFEFF" + [header.join(","), ...rows].join("\r\n");
}

// verify-ordering.mts
function make(id, date, createdAt, tag, intensity, pressureHpa) {
  return {
    id,
    date,
    createdAt,
    tag,
    intensity,
    note: `${id}-note`,
    pressureHpa,
    temperatureC: 20,
    humidityPercent: 60,
    windSpeedKmH: 20,
    windDirectionDeg: 90,
    windDirectionName: "\u4E1C"
  };
}
var base = [
  make("rec-a", "2026-09-20", 1e3, "\u6674\u7A7A\u4E07\u91CC", 8, 1030),
  make("rec-b1", "2026-09-21", 2e3, "\u9634\u8F6C\u591A\u4E91", 5, 1008),
  make("rec-b2", "2026-09-21", 2100, "\u5C40\u90E8\u6709\u7126\u8651", 7, 992),
  make("rec-c1", "2026-09-22", 3e3, "\u7A81\u53D1\u96F7\u66B4", 9, 975),
  make("rec-c2", "2026-09-22", 3100, "\u6696\u6E7F\u6C14\u6D41\u8FC7\u5883", 6, 1002),
  make("rec-c3", "2026-09-22", 3200, "\u6674\u7A7A\u4E07\u91CC", 8, 1030),
  make("rec-d1", "2026-09-23", 4e3, "\u4F4E\u6C14\u538B\u5927\u96FE", 4, 998),
  make("rec-d2", "2026-09-23", 4100, "\u5FAE\u98CE\u7166\u6696", 7, 1018),
  make("rec-e", "2026-09-24", 5e3, "\u6674\u7A7A\u4E07\u91CC", 8, 1024)
];
function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor(s / 233280 * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
var results = [];
var assert = (cond, msg) => {
  results.push((cond ? "PASS" : "FAIL") + " :: " + msg);
  if (!cond) process.exitCode = 1;
};
var orderSignatures = new Set(
  [1, 7, 42, 99, 12345, 20260926].map((seed) => canonicalizeRecords(shuffle(base, seed)).map((r) => r.id).join(","))
);
assert(orderSignatures.size === 1, "\u7A33\u5B9A\u5168\u5E8F\u6392\u5E8F\u4E0E\u8F93\u5165\u987A\u5E8F\u65E0\u5173");
assert(
  [...orderSignatures][0] === "rec-a,rec-b1,rec-b2,rec-c1,rec-c2,rec-c3,rec-d1,rec-d2,rec-e",
  "\u540C\u65E5\u6309 createdAt \u5347\u5E8F\u3001\u8DE8\u65E5\u6309 date \u5347\u5E8F: " + [...orderSignatures][0]
);
var deduped = canonicalizeRecords([...base, base[1], base[1]]);
assert(deduped.length === base.length, "\u6309 id \u53BB\u91CD\u9632\u6B62\u91CD\u590D\u8BA1\u5165");
var daySignatures = new Set(
  [1, 7, 42, 99, 12345, 20260926].map((seed) => JSON.stringify(mergeByDay(shuffle(base, seed))))
);
assert(daySignatures.size === 1, "\u540C\u65E5\u5408\u5E76\u7ED3\u679C\u4E0E\u8F93\u5165\u987A\u5E8F\u65E0\u5173");
var days = mergeByDay(base);
assert(days.length === 5, "\u5408\u5E76\u540E\u4E3A 5 \u4E2A\u81EA\u7136\u65E5");
var sep21 = days.find((d) => d.date === "2026-09-21");
assert(
  sep21.recordCount === 2 && sep21.pressureHpa === 1e3 && sep21.intensity === 6,
  `09-21 \u6C14\u538B\u65E5\u5747=1000((1008+992)/2), \u5F3A\u5EA6\u65E5\u5747=6: \u5B9E\u9645 ${sep21.pressureHpa}/${sep21.intensity}`
);
assert(sep21.tag === "\u9634\u8F6C\u591A\u4E91", "\u5E73\u5C40\u6807\u7B7E\u53D6\u5F53\u65E5\u6700\u65E9\u4E00\u6761\uFF08\u9634\u8F6C\u591A\u4E91 \u65E9\u4E8E \u5C40\u90E8\u6709\u7126\u8651\uFF09");
assert(
  sep21.representativeId === "rec-b2" && sep21.note === "rec-b2-note",
  "\u4EE3\u8868\u8BB0\u5F55\u4E3A\u5F53\u65E5\u6700\u540E\u4E00\u6761\uFF08\u6700\u65B0\u7B7E\u5230\uFF09"
);
var sep22 = days.find((d) => d.date === "2026-09-22");
assert(sep22.pressureHpa === Math.round((975 + 1002 + 1030) / 3), "09-22 \u4E09\u6761\u6C14\u538B\u65E5\u5747\u6B63\u786E: " + sep22.pressureHpa);
var charts = [1, 7, 42, 99, 12345, 20260926].map((seed) => {
  const chart = evaluateSynopticSystem(shuffle(base, seed));
  return {
    currentId: chart.currentRecord.id,
    avg: chart.averagePressure,
    trend: chart.monsoon.trendDirection,
    delta: chart.monsoon.trendDeltaHpa,
    records: chart.sortedRecords.map((r) => r.id).join(",")
  };
});
var chartSig = new Set(charts.map((c) => JSON.stringify(c)));
assert(chartSig.size === 1, "currentRecord/\u5747\u503C/\u8D8B\u52BF/\u65F6\u95F4\u7EBF\u5728\u4E71\u5E8F\u4E0B\u5B8C\u5168\u4E00\u81F4");
assert(charts[0].currentId === "rec-e", "\u5F53\u524D\u89C2\u6D4B=\u6700\u540E\u4E00\u65E5\u6700\u65B0\u8BB0\u5F55 rec-e");
var expectedAvg = Math.round([1030, 1e3, Math.round((975 + 1002 + 1030) / 3), Math.round((998 + 1018) / 2), 1024].reduce((a, b) => a + b, 0) / 5);
assert(charts[0].avg === expectedAvg, `\u5168\u5468\u671F\u65E5\u5747\u6C14\u538B=${expectedAvg}, \u5B9E\u9645 ${charts[0].avg}`);
assert(
  charts[0].trend === "\u4E0B\u884C" && charts[0].delta === 1024 - 1030,
  `\u8FD17\u65E5\u8D8B\u52BF=\u4E0B\u884C(-6hPa), \u5B9E\u9645 ${charts[0].trend}(${charts[0].delta})`
);
var summaries = [1, 7, 42, 99, 12345, 20260926].map((seed) => {
  const s = summarizeMood(shuffle(base, seed));
  return { dominant: s.dominant, avg: s.averageIntensity, count: s.count, recordCount: s.recordCount, tags: s.tags.join(",") };
});
assert(new Set(summaries.map((s) => JSON.stringify(s))).size === 1, "\u6458\u8981\u5728\u4E71\u5E8F\u4E0B\u5B8C\u5168\u4E00\u81F4");
assert(summaries[0].dominant === "\u6674\u7A7A\u4E07\u91CC", `\u4E3B\u5BFC\u60C5\u7EEA\u6309\u65E5\u9891\u6B21=\u6674\u7A7A\u4E07\u91CC(2\u5929), \u5B9E\u9645 ${summaries[0].dominant}`);
assert(
  summaries[0].count === 5 && summaries[0].recordCount === 9,
  `\u89C2\u6D4B\u65E5=5\u3001\u539F\u59CB\u8BB0\u5F55=9, \u5B9E\u9645 ${summaries[0].count}/${summaries[0].recordCount}`
);
var chartA = evaluateSynopticSystem(shuffle(base, 1));
var chartB = evaluateSynopticSystem(shuffle(base, 999));
var normalizeJson = (s) => {
  const parsed = JSON.parse(s);
  delete parsed.exportedAt;
  return JSON.stringify(parsed);
};
var jsonA = normalizeJson(exportMoodJson(chartA));
var jsonB = normalizeJson(exportMoodJson(chartB));
if (jsonA !== jsonB) {
  const deepDiff = (a, b, path) => {
    const out = [];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push(`${path} length ${a.length} vs ${b.length}`);
      a.forEach((v, i) => out.push(...deepDiff(v, b[i], `${path}[${i}]`)));
    } else if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])) {
        out.push(...deepDiff(a[key], b[key], `${path}.${key}`));
      }
    } else if (a !== b) {
      out.push(`${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    }
    return out;
  };
  results.push(...deepDiff(JSON.parse(jsonA), JSON.parse(jsonB), "$").map((d) => "  diff: " + d));
}
assert(jsonA === jsonB, "JSON \u5BFC\u51FA\u4E0E\u8F93\u5165\u987A\u5E8F\u65E0\u5173");
assert(exportMoodCsv(chartA) === exportMoodCsv(chartB), "CSV \u5BFC\u51FA\u4E0E\u8F93\u5165\u987A\u5E8F\u65E0\u5173");
assert(exportMoodCsv(chartA).startsWith("\uFEFF\u65E5\u671F,\u4E3B\u5BFC\u60C5\u7EEA"), "CSV \u542B UTF-8 BOM \u4E14\u8868\u5934\u56FA\u5B9A");
var csvLines = exportMoodCsv(chartA).split("\r\n");
assert(csvLines.length === 6, "CSV \u884C\u6570=\u8868\u5934+5\u4E2A\u89C2\u6D4B\u65E5");
var legacy = base.map(({ createdAt, ...rest }) => rest);
var legacySorted = canonicalizeRecords(legacy);
assert(
  legacySorted.map((r) => r.id).join(",") === "rec-a,rec-b1,rec-b2,rec-c1,rec-c2,rec-c3,rec-d1,rec-d2,rec-e",
  "\u7F3A\u5931 createdAt \u65F6\u4ECE rec-<ts>- \u524D\u7F00\u89E3\u6790\u6392\u5E8F"
);
var emptyChart = evaluateSynopticSystem([]);
assert(
  emptyChart.dailyMoods.length === 0 && emptyChart.sortedRecords.length === 0 && emptyChart.recordCount === 0,
  "\u7A7A\u6570\u636E\u4EA7\u751F\u5B89\u5168\u7A7A\u5E8F\u5217"
);
assert(
  summarizeMood([]).dominant === "\u6682\u65E0" && summarizeMood([]).averageIntensity === 0,
  "\u7A7A\u6570\u636E\u6458\u8981\u6709\u5B89\u5168\u9ED8\u8BA4\u503C"
);
mkdirSync("dist-test", { recursive: true });
writeFileSync("dist-test/result.txt", results.join("\n") + "\n");
console.log(results.join("\n"));
