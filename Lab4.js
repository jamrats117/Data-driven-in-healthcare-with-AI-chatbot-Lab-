/**
 * =================================================================
 * 🚀 DIALOGFLOW ES WEBHOOK - CODE.GS (NO-DEPENDENCY VERSION)
 * =================================================================
 * - ไม่มีการเรียกใช้ไลบรารีภายนอก (No BetterLog)
 * - ใช้ Logger ในตัวของ Apps Script เพื่อประสิทธิภาพสูงสุด
 * - ปฏิบัติตามกฎ "ห้ามอ่าน Sheet" ใน doPost() อย่างเคร่งครัด
 *
 * 👉 ดู Log ได้ที่เมนู "Executions" ใน Apps Script Editor
 */

// ----------------------------------------------------------------
// 🔧 CONFIGURATION
// ----------------------------------------------------------------

const INTENT_PREFIX = "herb";
const CODE_REGEX = /^[hH]\d+/;

// =================================================================
// 🏛️ CORE CACHE-ONLY WRAPPERS
// =================================================================

function getDataCacheOnly_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log("Error parsing cache: " + e.message);
      return null;
    }
  }
  return null;
}

function findByIndexCacheOnly_(key, value) {
  if (!value) {
    return null;
  }

  const cacheData = getDataCacheOnly_();
  if (!cacheData) {
    return "CACHE_MISS";
  }

  const indexer = INDEX_KEYS[key];
  if (!indexer || !cacheData.index || !cacheData.index[key]) {
      Logger.log("Error: Index key '" + key + "' is not configured or not found in cache structure.");
      return null;
  }

  const normalizedValue = indexer(value);
  return cacheData.index[key][normalizedValue] || null;
}

// =================================================================
// 🌐 WEBHOOK ENTRY POINT
// =================================================================

function doPost(e) {
  Logger.log("--- doPost Start ---");

  try {
    const request = JSON.parse(e.postData.contents);
    const intentName = request.queryResult.intent.displayName;
    Logger.log("Intent received: " + intentName);

    if (!intentName.startsWith(INTENT_PREFIX)) {
      Logger.log("Intent does not match prefix. Skipping.");
      return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
    }

    const query = extractQueryFromContexts_(request.queryResult.outputContexts);

    if (!query) {
      Logger.log("Query not found in any context.");
      // ✨ DECORATED RESPONSE
      return createJsonResponse_("🤔 ไม่พบคำค้นหา กรุณาลองใหม่อีกครั้งค่ะ");
    }
    Logger.log("Query found: '" + query + "'");

    const searchKey = CODE_REGEX.test(query) ? "code" : "herb";
    Logger.log("Searching with index: '" + searchKey + "'");

    const result = findByIndexCacheOnly_(searchKey, query);

    if (result === "CACHE_MISS") {
      Logger.log("Result: Cache Miss");
       // ✨ DECORATED RESPONSE
      return createJsonResponse_("⏳ ระบบกำลังโหลดข้อมูลชั่วครู่ กรุณาลองใหม่อีกครั้งใน 1-2 นาทีค่ะ");

    } else if (result) {
      Logger.log("Result: Found item with code: " + result.code);
      const message = formatSuccessMessage_(result);
      return createJsonResponse_(message);

    } else {
      Logger.log("Result: Not Found in system for query: " + query);
       // ✨ DECORATED RESPONSE
      return createJsonResponse_(`🙁 ไม่พบข้อมูล "${query}" ในระบบค่ะ กรุณาตรวจสอบคำค้นหา หรือสอบถาม Admin นะคะ`);
    }

  } catch (error) {
    Logger.log("!!! CRITICAL ERROR in doPost: " + error.toString() + " Stack: " + error.stack);
     // ✨ DECORATED RESPONSE
    return createJsonResponse_("🚨 ขออภัยค่ะ เกิดข้อผิดพลาดในระบบ โปรดแจ้ง Admin เพื่อทำการตรวจสอบค่ะ");
  } finally {
    Logger.log("--- doPost End ---");
  }
}

// =================================================================
// 🧰 HELPER FUNCTIONS
// =================================================================

function extractQueryFromContexts_(outputContexts) {
  if (!outputContexts || outputContexts.length === 0) return null;
  let query = null;
  for (let i = 0; i < outputContexts.length; i++) {
    const params = outputContexts[i].parameters;
    if (params) {
      if (params.herb && String(params.herb).trim()) {
        query = String(params.herb).trim();
        break;
      }
      if (params["herb.original"] && String(params["herb.original"]).trim()) {
        query = String(params["herb.original"]).trim();
      }
    }
  }
  return query;
}

/**
 * ✨ NEW: DECORATED SUCCESS MESSAGE FUNCTION
 * Formats the success message with emojis.
 */
function formatSuccessMessage_(item) {
  return `🌿 ข้อมูลสมุนไพร: ${item.herb} (รหัส: ${item.code})\n` +
         `✨ สรรพคุณ: ${item.effect}\n` +
         `📝 รายละเอียด: ${item.description}\n` +
         `📊 ระดับความน่าเชื่อถือ: ${item.loe}\n` +
         `📚 อ้างอิง: ${item.ref}`;
}

function createJsonResponse_(text) {
  const response = {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }]
  };
  return ContentService.createTextOutput(JSON.stringify(response))
                       .setMimeType(ContentService.MimeType.JSON);
}
