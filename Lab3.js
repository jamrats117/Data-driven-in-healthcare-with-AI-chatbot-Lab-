/**
 * 📦 GENERIC SHEET CACHE TEMPLATE
 * - อ่านข้อมูลจาก Google Sheet → CacheService (JSON)
 * - ออกแบบให้ reuse ได้ทุกโปรเจกต์
 */

/* ======================================================
 * 🔧 CONFIG ZONE (แก้แค่ตรงนี้)
 * ====================================================== */

// 🔧 1️⃣ ชื่อ cache (ต้องไม่ซ้ำกันในโปรเจกต์)
const CACHE_KEY = "DATA_CACHE_V1";

// 🔧 2️⃣ อายุ cache (วินาที)
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 ชั่วโมง

// 🔧 3️⃣ REQUIRED COLUMNS (ชื่อ header ใน sheet)
const REQUIRED_COLUMNS = [
  "code",
  "herb",
  "effect",
  "description",
  "loe",
  "ref"
];

// 🔧 4️⃣ INDEX KEYS → จะค้นหาเร็วด้วย field อะไรบ้าง
// key = field ใน object
// value = function normalize
const INDEX_KEYS = {
  code: v => String(v).toLowerCase(),
  herb: v => String(v).toLowerCase()
};

/* ======================================================
 * 🚀 CACHE CORE
 * ====================================================== */

function getDataCache_(options) {
  options = options || {};
  const forceRefresh = !!options.forceRefresh;

  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
  }

  const data = buildCacheFromSheet_();
  cache.put(CACHE_KEY, JSON.stringify(data), CACHE_TTL_SECONDS);
  return data;
}

function refreshDataCache_() {
  return getDataCache_({ forceRefresh: true });
}

function clearDataCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

/* ======================================================
 * 📄 BUILD CACHE FROM SHEET
 * ====================================================== */

function buildCacheFromSheet_() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("SHEET_ID");
  const sheetName = props.getProperty("SHEET_NAME") || "data"; // 🔧 5️⃣

  if (!sheetId) throw new Error("Missing SHEET_ID");

  const sh = SpreadsheetApp.openById(sheetId).getSheetByName(sheetName);
  if (!sh) throw new Error("Sheet not found: " + sheetName);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { data: [], index: {}, meta: { rows: 0 } };
  }

  const headers = values[0].map(h => normalizeHeader_(h));
  const idx = indexMap_(headers);

  // 🔧 ตรวจ column ที่จำเป็น
  REQUIRED_COLUMNS.forEach(col => {
    if (idx[col] === undefined) {
      throw new Error("Missing column: " + col);
    }
  });

  const index = {};
  Object.keys(INDEX_KEYS).forEach(k => index[k] = {});

  const data = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const item = {};

    headers.forEach(h => {
      item[h] = String(row[idx[h]] || "").trim();
    });

    data.push(item);

    // 🔧 สร้าง index
    for (const key in INDEX_KEYS) {
      const raw = item[key];
      if (!raw) continue;
      const normalized = INDEX_KEYS[key](raw);
      index[key][normalized] = item;
    }
  }

  return {
    data,
    index,
    meta: {
      rows: data.length,
      sheetName,
      updatedAt: new Date().toISOString(),
      ttlSeconds: CACHE_TTL_SECONDS
    }
  };
}

/* ======================================================
 * 🔎 SEARCH HELPERS
 * ====================================================== */

function findByIndex_(key, value) {
  if (!value) return null;
  const cache = getDataCache_();
  const normalized = INDEX_KEYS[key](value);
  return cache.index[key]?.[normalized] || null;
}

/* ======================================================
 * 🧰 UTIL
 * ====================================================== */

function indexMap_(headers) {
  const m = {};
  headers.forEach((h, i) => m[h] = i);
  return m;
}

function normalizeHeader_(h) {
  return String(h).trim().toLowerCase().replace(/\s+/g, "_");
}

/* ======================================================
 * 🧪 PUBLIC FUNCTIONS
 * ====================================================== */

function buildCache() {
  const data = refreshDataCache_();
  Logger.log(data.meta);
}

function testFind() {
  const item = findByIndex_("herb", "xx");
  Logger.log(item);
}
