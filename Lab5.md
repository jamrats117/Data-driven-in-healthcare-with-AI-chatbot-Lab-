ฉันต้องการให้คุณเขียน **Google Apps Script Webhook ไว้ในไฟล์ Code.gs สำหรับ Dialogflow (ES)** โดยมีข้อกำหนดแบบ “เข้มงวด” ดังนี้

---
## 0A. ข้อมูลที่ทำไว้แล้ว 
ใน Project มีไฟล์ Cache.gs ซึ่งมี Code นี้อยู่แล้ว
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

## A. กติกาห้ามละเมิด (Critical)

1. ใน `doPost(e)` และทุกฟังก์ชันที่ `doPost` เรียกใช้ **ห้ามอ่าน Google Sheet โดยตรงหรือโดยอ้อม** เด็ดขาด

   * ห้ามใช้ `SpreadsheetApp.*`
   * ห้ามเรียกฟังก์ชันใด ๆ ที่ “อาจ” ไปเรียก `SpreadsheetApp` ภายใน
   * ถ้า cache ว่าง/หมดอายุ ให้ตอบกลับทันทีแบบ graceful (ดูข้อ E)

2. ห้ามให้ฟังก์ชัน cache “auto-refresh” เมื่อ cache miss

   * ต้องมี “โหมด cache-only” ที่รับประกันว่า **ไม่ refresh และไม่อ่านชีท**
   * ถ้า template เดิม refresh อัตโนมัติ ให้ “สร้าง wrapper ใหม่” เพื่อบล็อกการ refresh และใช้ wrapper นั้นใน `doPost`

3. Logging: ใช้ได้เฉพาะ

```js
var log = BetterLog.useSpreadsheet();
log.log(...)
```

ห้ามใช้ `console.log` และห้ามใช้ `log.info/warn/error`

---

## B. โครงสร้างระบบ (ปรับใช้ได้ทุกโปรเจกต์)

* มี Script Properties: `SHEET_ID`, `SHEET_NAME` (ถ้าโปรเจกต์อื่นไม่มี ให้คงไว้เป็น placeholder)
* มีไฟล์ `cache.gs` เป็น generic cache template (ชื่อฟังก์ชันอาจต่างได้ แต่หลักการต้องเหมือนกัน):

  * `getDataCache_(options)` → คืน `{ data, index, meta }`
  * `refreshDataCache_()` / `clearDataCache_()`
  * `findByIndex_(key, value)` → คืน object หรือ `null`

**หมายเหตุ:** `doPost` ต้องใช้ “cache-only” เท่านั้น

---

## C. Dialogflow: เงื่อนไข intent (ปรับได้)

* อ่าน `intent.displayName`
* อนุญาตเฉพาะ intent ที่ “ขึ้นต้นด้วย prefix” ที่กำหนด (ตัวอย่างใช้ `"HERB_Check_INR"`)
* ถ้าไม่ตรง ให้ return 200 JSON `{}` ทันที

---

## D. Dialogflow: การดึงค่า query จาก outputContexts (ปรับชื่อพารามิเตอร์ได้)

* วน `request.queryResult.outputContexts`
* หา context ที่มีพารามิเตอร์หลัก (ตัวอย่าง `parameters.herb`)
  ถ้าไม่มี ให้ใช้ค่าต้นฉบับ (ตัวอย่าง `parameters["herb.original"]`)
* ถ้าไม่พบค่า query เลย ให้ตอบกลับ:
  `ไม่พบข้อมูลที่ต้องการค้นหา`

---

## E. Logic การค้นหา (Cache-only)

* มีกติกาเลือก index ตามรูปแบบ query (ตัวอย่าง)

  * ถ้า query ตรง regex `^[hH]\d+` → ค้นด้วย `code`
  * ไม่เช่นนั้น → ค้นด้วย `herb`
* ต้องค้นด้วยฟังก์ชัน wrapper ที่ “รับประกัน cache-only” เช่น:

  * `findByIndexCacheOnly_("code", query)`
  * `findByIndexCacheOnly_("herb", query)`

**สำคัญ:** `findByIndexCacheOnly_` ต้องรับประกันว่า:

* อ่านจาก CacheService เท่านั้น
* ถ้า cache miss/หมดอายุ/ไม่มี index ให้ return `null` โดยไม่ refresh และไม่อ่านชีท

ถ้า cache miss ให้ตอบกลับ:
`ระบบกำลังโหลดข้อมูล กรุณาลองใหม่อีกครั้ง`

---

## F. รูปแบบ response (Dialogflow v2)

ต้องส่งกลับทั้ง `fulfillmentText` และ `fulfillmentMessages` เพื่อให้เข้ากันได้หลายช่องทาง:

* ถ้าพบข้อมูล ให้ส่งข้อความแบบหลายบรรทัด (ปรับ template ได้ตามโปรเจกต์)
* ถ้าไม่พบ ให้ส่ง:
  `ไม่พบข้อมูลในระบบ กรุณาสอบถาม Admin`

---

## G. Minimal logging ที่ต้องมี

ให้ `log.log()` อย่างน้อย:

* start doPost
* intent ที่รับมา
* พบ/ไม่พบค่า query จาก context
* query ที่ใช้ค้นหา
* เลือกค้นด้วย index อะไร
* ผลลัพธ์ found/not found
* cache hit/miss (ต้องแยกให้ชัด)

---

## H. โครงโค้ดตัวอย่างการวนหา context (ให้ใช้แนวนี้)

```javascript
var outputContexts = request.queryResult.outputContexts;
var contextParameters = {};

for (var i = 0; i < outputContexts.length; i++) {
  if (outputContexts[i].parameters && outputContexts[i].parameters.herb) {
    contextParameters = outputContexts[i].parameters;
    break;
  }
}
```
