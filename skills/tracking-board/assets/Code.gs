/**
 * Google Apps Script — API ของบอร์ดติดตามงาน (`/tracking`) แบบ Trello · มาจากสกิล tracking-board
 *
 * @description
 * วางไฟล์นี้ใน Extensions → Apps Script ของ Google Sheet แล้ว Deploy เป็น Web App
 * (ขั้นตอนเต็มอยู่ใน references/setup-guide.md ของสกิล — ก๊อปไปไว้ในโปรเจกต์คู่กับไฟล์นี้)
 *
 * - GET  `?action=list` → { ok, items, comments } · ส่งเฉพาะแถวที่ติ๊กคอลัมน์ `publish`
 * - POST (ส่งเป็น text/plain) — ไม่มีล็อกอิน · ชื่อพิมพ์เองทุกครั้ง
 *   - `{ action: 'comment', itemId, author, message }` → { ok, comment } · `author` ต้องมี
 *   - `{ action: 'createItem', author, item }` → { ok, item } · `author` ต้องมี · ออกรหัส T-### ให้ · เผยแพร่ทันที
 *   - `{ action: 'updateItem', author?, id, baseUpdatedAt, changes }` → { ok, item, log }
 *     `author` มาจากฟอร์มแก้ไข · ลากย้ายสถานะไม่ส่ง (= ไม่ระบุชื่อ)
 *     สถานะเปลี่ยน → เขียนคอมเมนต์ "ย้ายสถานะ: ก → ข" ให้อัตโนมัติ (log · ในชื่อผู้แก้ถ้ามี)
 *   - `{ action: 'archiveItem', id, baseUpdatedAt }` → { ok } · เอาติ๊ก publish ออก (แถวยังอยู่) · ไม่ระบุชื่อ
 * - กันแก้ทับกัน: `baseUpdatedAt` ต้องตรงกับ `updatedAt` ในชีต ไม่งั้นปฏิเสธ ให้ผู้ใช้รีเฟรชก่อน
 * - ตรวจทุกอย่างฝั่งนี้อีกชั้น: ความยาว · ค่าตัวเลือก · ข้อความไม่กลายเป็นสูตร · จำกัดจำนวนการเขียนต่อนาที
 *
 * ⚠️ ค่าใน LIMITS ต้องตรงกับ `TRACKING_LIMITS` ใน tracking-api.ts ของหน้าเว็บ
 * ⚠️ คำใน TYPE / STATUS / PRIORITY ต้องตรงกับ tracking-labels.ts ของหน้าเว็บ
 * ⚠️ แก้ไฟล์นี้แล้วรัน `node scripts/test-code-gs.js <path ของไฟล์นี้>` ในโฟลเดอร์สกิล ก่อนให้ผู้ใช้เอาไปวาง
 */

/** ชื่อแท็บในชีต */
var SHEET_ITEMS = 'items'
var SHEET_COMMENTS = 'comments'

/** หัวคอลัมน์ (แถวที่ 1) — คีย์อังกฤษตรงกับที่หน้าเว็บอ่าน · ลำดับคอลัมน์สลับได้ แต่ห้ามเปลี่ยนชื่อ */
var ITEM_HEADERS = [
  'id', 'publish', 'type', 'module', 'title', 'detail', 'status', 'priority',
  'askedAt', 'answeredAt', 'answer', 'release', 'blocks', 'link',
  'createdBy', 'createdAt', 'updatedBy', 'updatedAt',
  'dueAt',
]
var COMMENT_HEADERS = ['id', 'itemId', 'author', 'message', 'createdAt']

/** คีย์ที่หน้าเว็บส่ง → คำไทยที่เก็บในชีต (ตรงกับ dropdown) */
var TYPE = { question: 'คำถาม', requirement: 'requirement', request: 'ขอเพิ่ม', bug: 'แจ้งปัญหา', decision: 'ข้อตกลง' }
var STATUS = { waiting_client: 'รอตอบ', waiting_team: 'รอทีมเรา', in_progress: 'กำลังทำ', done: 'เสร็จแล้ว', on_hold: 'พักไว้' }
var PRIORITY = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ', none: '' }

var LIMITS = {
  author: 60, message: 2000, title: 200, detail: 5000, answer: 5000,
  module: 40, release: 40, blocks: 500, link: 500,
}
/** ช่องข้อความอิสระที่แก้ได้ */
var TEXT_FIELDS = ['title', 'detail', 'answer', 'module', 'release', 'blocks', 'link']
/** ช่องวันที่ที่แก้ได้ (รับ yyyy-mm-dd หรือว่าง) */
var DATE_FIELDS = ['askedAt', 'answeredAt', 'dueAt']
/** ช่องที่เก็บเป็นตัวหนังสือล้วน — ห้ามให้ชีตแปลงเป็นวันที่ (ต้องเทียบตรงตัวอักษรตอนกันแก้ทับ) */
var PLAIN_TEXT_FIELDS = ['createdAt', 'updatedAt']

/** เขียนรวมทุกคนได้ไม่เกินกี่ครั้งต่อนาที — กันสคริปต์ยิงถล่มชีต (ไม่มีล็อกอินให้แยกรายคน) */
var MAX_WRITES_PER_MINUTE = 60

/*------------------------------ ตั้งค่าครั้งแรก ---------------------------------*/

/**
 * สร้าง/อัปเกรดแท็บ items · comments พร้อมหัวคอลัมน์ · checkbox · dropdown
 * @description กด Run ครั้งแรก และทุกครั้งที่อัปเดตสคริปต์ — รันซ้ำได้ ไม่ลบข้อมูลเดิม
 *              หัวคอลัมน์ที่ยังไม่มี (เช่นชีตจากเวอร์ชันก่อน) จะถูกเติมต่อท้ายให้
 */
function setupSheets() {
  var book = SpreadsheetApp.getActiveSpreadsheet()

  var items = ensureHeaders(book.getSheetByName(SHEET_ITEMS) || book.insertSheet(SHEET_ITEMS), ITEM_HEADERS)
  var rows = items.getMaxRows() - 1
  var col = headerIndex(items)
  items.getRange(2, col.publish, rows, 1).insertCheckboxes()
  items.getRange(2, col.type, rows, 1).setDataValidation(listRule(values(TYPE)))
  items.getRange(2, col.status, rows, 1).setDataValidation(listRule(values(STATUS)))
  items.getRange(2, col.priority, rows, 1).setDataValidation(listRule(['สูง', 'กลาง', 'ต่ำ']))
  DATE_FIELDS.forEach(function (key) { items.getRange(2, col[key], rows, 1).setNumberFormat('yyyy-mm-dd') })
  PLAIN_TEXT_FIELDS.forEach(function (key) { items.getRange(2, col[key], rows, 1).setNumberFormat('@') })

  var comments = ensureHeaders(book.getSheetByName(SHEET_COMMENTS) || book.insertSheet(SHEET_COMMENTS), COMMENT_HEADERS)
  comments.getRange(2, headerIndex(comments).createdAt, comments.getMaxRows() - 1, 1).setNumberFormat('@')
}

/** เติมหัวคอลัมน์ที่ขาดต่อท้ายแถว 1 · ตรึงแถวหัว · ตัวหนา */
function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers)
  var existing = headerIndex(sheet)
  var missing = headers.filter(function (header) { return !existing[header] })
  if (missing.length) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing])
  }
  sheet.setFrozenRows(1)
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold')
  return sheet
}

/** กฎ dropdown — พิมพ์ค่านอกรายการได้แต่ขึ้นเตือน (หน้าเว็บโชว์เป็น "ไม่ทราบสถานะ") */
function listRule(choices) {
  return SpreadsheetApp.newDataValidation().requireValueInList(choices, true).setAllowInvalid(true).build()
}

function values(map) {
  return Object.keys(map).map(function (key) { return map[key] })
}

/** แผนที่ ชื่อหัวคอลัมน์ → เลขคอลัมน์ (เริ่ม 1) */
function headerIndex(sheet) {
  var index = {}
  if (sheet.getLastColumn() === 0) return index
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].forEach(function (header, i) {
    var name = String(header).trim()
    if (name) index[name] = i + 1
  })
  return index
}

/*------------------------------ อ่าน ---------------------------------*/

/** GET — อ่านเรื่องที่เผยแพร่ + คอมเมนต์ของเรื่องเหล่านั้น */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list'
    if (action !== 'list') return fail('ไม่รู้จักคำสั่งนี้')

    var items = readItems()
    var published = {}
    items.forEach(function (item) { published[item.id] = true })

    // คอมเมนต์ของเรื่องที่ซ่อนอยู่ ห้ามหลุดออกไป
    var comments = readRows(SHEET_COMMENTS).filter(function (row) {
      return published[String(row.itemId)]
    })

    return json({ ok: true, items: items, comments: comments })
  } catch (error) {
    return json({ ok: false, error: 'อ่านชีตไม่สำเร็จ: ' + error.message })
  }
}

/** อ่านเฉพาะเรื่องที่ติ๊ก publish — ตัดคอลัมน์ publish ออกก่อนส่ง */
function readItems() {
  return readRows(SHEET_ITEMS)
    .filter(function (row) { return row.publish === true && String(row.id).trim() !== '' })
    .map(publicItem)
}

/** ตัดช่องภายใน (publish · เลขแถว) ออกก่อนส่งให้หน้าเว็บ */
function publicItem(row) {
  if (!row) return null
  delete row.publish
  delete row._row
  return row
}

/**
 * อ่านทั้งแท็บเป็น array ของ object (คีย์ = หัวคอลัมน์แถวที่ 1)
 * @description วันที่แปลงเป็น ISO · คอลัมน์ที่ไม่มีหัวถูกข้าม · `_row` = เลขแถวในชีต (ใช้ตอนเขียนกลับ)
 */
function readRows(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
  if (!sheet || sheet.getLastRow() < 2) return []

  var values = sheet.getDataRange().getValues()
  var headers = values[0].map(function (header) { return String(header).trim() })

  return values.slice(1).map(function (row, i) {
    var record = { _row: i + 2 }
    headers.forEach(function (header, index) {
      if (!header) return
      var value = row[index]
      record[header] = value instanceof Date ? value.toISOString() : value
    })
    return record
  })
}

/*------------------------------ เขียน ---------------------------------*/

/** POST — รับคำสั่งเขียนทุกชนิด */
function doPost(e) {
  var lock = LockService.getScriptLock()
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    // ชื่อบังคับตอนคอมเมนต์/สร้าง · แก้ไม่บังคับ (ลากไม่ส่ง) · ซ่อนไม่ใช้
    var author = clean(body.author, LIMITS.author + 1)
    if (author.length > LIMITS.author) return fail('ชื่อยาวได้ไม่เกิน ' + LIMITS.author + ' ตัวอักษร')

    // ล็อกทั้งคำสั่ง — กันสองคนเขียนพร้อมกันแล้วออกรหัสซ้ำ/เช็คแก้ทับพลาด
    lock.waitLock(10000)
    if (!takeQuota()) return fail('มีการแก้ไขเข้ามาถี่เกินไป รอสักครู่แล้วลองใหม่')

    if (body.action === 'comment') return addComment(author, body)
    if (body.action === 'createItem') {
      if (!author) return fail('กรอกชื่อผู้บันทึก')
      return createItem(author, body.item || {})
    }
    if (body.action === 'updateItem') return updateItem(author, body)
    if (body.action === 'archiveItem') return archiveItem('', body)
    return fail('ไม่รู้จักคำสั่งนี้')
  } catch (error) {
    return fail('บันทึกไม่สำเร็จ: ' + error.message)
  } finally {
    lock.releaseLock()
  }
}

/** เพิ่มคอมเมนต์ — ต้องมีชื่อผู้คอมเมนต์ */
function addComment(author, body) {
  if (!author || author.length > LIMITS.author) return fail('กรอกชื่อผู้คอมเมนต์ (1–' + LIMITS.author + ' ตัวอักษร)')
  var itemId = clean(body.itemId, 40)
  var message = clean(body.message, LIMITS.message + 1)
  if (!message || message.length > LIMITS.message) return fail('ข้อความต้องมี 1–' + LIMITS.message + ' ตัวอักษร')
  if (!findPublished(itemId)) return fail('ไม่พบเรื่องนี้ หรือเรื่องนี้ถูกซ่อนแล้ว')

  return json({ ok: true, comment: appendComment(itemId, author, message) })
}

/** สร้างเรื่องใหม่ — ออกรหัส T-### ต่อจากเลขสูงสุดในชีต · เผยแพร่ทันที */
function createItem(author, input) {
  var result = readInput(input, true)
  if (result.error) return fail(result.error)

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ITEMS)
  var now = new Date().toISOString()
  var record = result.values
  record.id = nextId()
  record.publish = true
  record.createdBy = author
  record.createdAt = now
  record.updatedBy = author
  record.updatedAt = now

  var col = headerIndex(sheet)
  var row = sheet.getLastRow() + 1
  writeRecord(sheet, row, col, record)

  return json({ ok: true, item: publicItem(findPublished(record.id)) })
}

/** แก้เรื่อง — เฉพาะช่องที่ส่งมา · สถานะเปลี่ยนแล้วเขียนบันทึกลงคอมเมนต์ */
function updateItem(author, body) {
  var current = findPublished(clean(body.id, 40))
  if (!current) return fail('ไม่พบเรื่องนี้ หรือเรื่องนี้ถูกซ่อนแล้ว')
  if (String(current.updatedAt || '') !== String(body.baseUpdatedAt || '')) {
    return fail('มีคนแก้เรื่องนี้ไปก่อนแล้ว — กดรีเฟรชแล้วลองใหม่')
  }

  var result = readInput(body.changes || {}, false)
  if (result.error) return fail(result.error)

  var record = result.values
  record.updatedBy = author
  record.updatedAt = new Date().toISOString()

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ITEMS)
  writeRecord(sheet, current._row, headerIndex(sheet), record)

  // ย้ายสถานะ → บันทึกในคอมเมนต์ ให้ย้อนดูได้ว่าใครย้ายเมื่อไร
  var log = null
  if (record.status !== undefined && record.status !== current.status) {
    log = appendComment(current.id, author, 'ย้ายสถานะ: ' + (current.status || '—') + ' → ' + record.status)
  }

  return json({ ok: true, item: publicItem(findPublished(current.id)), log: log })
}

/** ซ่อนเรื่อง — เอาติ๊ก publish ออก แถวยังอยู่ (ทีมติ๊กกลับในชีตได้) */
function archiveItem(author, body) {
  var current = findPublished(clean(body.id, 40))
  if (!current) return fail('ไม่พบเรื่องนี้ หรือเรื่องนี้ถูกซ่อนแล้ว')
  if (String(current.updatedAt || '') !== String(body.baseUpdatedAt || '')) {
    return fail('มีคนแก้เรื่องนี้ไปก่อนแล้ว — กดรีเฟรชแล้วลองใหม่')
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ITEMS)
  writeRecord(sheet, current._row, headerIndex(sheet), {
    publish: false,
    updatedBy: author,
    updatedAt: new Date().toISOString(),
  })
  return json({ ok: true })
}

/*------------------------------ ตัวช่วย ---------------------------------*/

/**
 * ตรวจ + แปลงข้อมูลเรื่องจากหน้าเว็บเป็นค่าที่จะเขียนลงชีต
 * @param input object จากหน้าเว็บ (คีย์อังกฤษ)
 * @param isCreate true = ต้องมีหัวข้อ · ช่องที่ไม่ส่งมาได้ค่าเริ่มต้น
 * @returns { values } หรือ { error }
 */
function readInput(input, isCreate) {
  var out = {}

  for (var i = 0; i < TEXT_FIELDS.length; i++) {
    var key = TEXT_FIELDS[i]
    if (input[key] === undefined && !isCreate) continue
    var text = clean(input[key], LIMITS[key] + 1)
    if (text.length > LIMITS[key]) return { error: 'ช่อง ' + key + ' ยาวได้ไม่เกิน ' + LIMITS[key] + ' ตัวอักษร' }
    out[key] = text
  }
  if (out.title !== undefined && !out.title) return { error: 'กรอกหัวข้อ' }
  if (out.link && !/^https?:\/\//i.test(out.link)) return { error: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' }

  var choiceFields = [['type', TYPE, 'question'], ['status', STATUS, 'waiting_client'], ['priority', PRIORITY, 'none']]
  for (var j = 0; j < choiceFields.length; j++) {
    var name = choiceFields[j][0], map = choiceFields[j][1], fallback = choiceFields[j][2]
    if (input[name] === undefined && !isCreate) continue
    var keyValue = input[name] === undefined ? fallback : String(input[name])
    if (!Object.prototype.hasOwnProperty.call(map, keyValue)) return { error: 'ค่าช่อง ' + name + ' ไม่ถูกต้อง' }
    out[name] = map[keyValue]
  }

  for (var k = 0; k < DATE_FIELDS.length; k++) {
    var dateKey = DATE_FIELDS[k]
    if (input[dateKey] === undefined && !isCreate) continue
    var raw = clean(input[dateKey], 10)
    if (!raw) { out[dateKey] = ''; continue }
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!match) return { error: 'รูปแบบวันที่ไม่ถูกต้อง' }
    out[dateKey] = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  return { values: out }
}

/**
 * เขียนหลายช่องในแถวเดียว (ตามชื่อหัวคอลัมน์)
 * @description ข้อความเติม ' นำหน้าถ้าขึ้นต้นด้วย = + - @ (กันกลายเป็นสูตร) ·
 *              ช่องเวลาตั้งรูปแบบเป็นตัวหนังสือก่อนเขียน ชีตจะได้ไม่แปลงเป็นวันที่
 */
function writeRecord(sheet, row, col, record) {
  Object.keys(record).forEach(function (key) {
    if (!col[key]) return
    var cell = sheet.getRange(row, col[key])
    var value = record[key]
    if (PLAIN_TEXT_FIELDS.indexOf(key) >= 0) cell.setNumberFormat('@')
    if (key === 'publish') cell.insertCheckboxes()
    cell.setValue(typeof value === 'string' ? asPlainText(value) : value)
  })
}

/** เพิ่มแถวคอมเมนต์ แล้วคืน object คอมเมนต์ */
function appendComment(itemId, author, message) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_COMMENTS)
  var comment = {
    id: 'C-' + Utilities.getUuid().slice(0, 8),
    itemId: itemId,
    author: author,
    message: message,
    createdAt: new Date().toISOString(),
  }
  writeRecord(sheet, sheet.getLastRow() + 1, headerIndex(sheet), comment)
  return comment
}

/** หาเรื่องที่เผยแพร่อยู่ตามรหัส (มี `_row` ติดมา) — ไม่เจอได้ null */
function findPublished(id) {
  if (!id) return null
  var rows = readRows(SHEET_ITEMS)
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id && rows[i].publish === true) return rows[i]
  }
  return null
}

/** รหัสถัดไป T-### — นับจากทุกแถว (รวมแถวที่ซ่อน) กันรหัสซ้ำกับเรื่องที่ซ่อนไว้ */
function nextId() {
  var max = 0
  readRows(SHEET_ITEMS).forEach(function (row) {
    var match = /^T-(\d+)$/.exec(String(row.id))
    if (match) max = Math.max(max, Number(match[1]))
  })
  var num = String(max + 1)
  while (num.length < 3) num = '0' + num
  return 'T-' + num
}

/** ตัดช่องว่างหัวท้าย · ตัดอักขระควบคุม (ยกเว้นขึ้นบรรทัด) · ตัดความยาวกันข้อความยักษ์ */
function clean(value, maxLength) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength)
}

/**
 * กันข้อความกลายเป็นสูตรในชีต
 * @description ขึ้นต้นด้วย = + - @ ชีตจะตีความเป็นสูตร (เช่น =IMPORTXML(...) ดึงข้อมูลออกไปนอกชีตได้)
 *              เติม ' นำหน้าให้ชีตเก็บเป็นข้อความ — ' ไม่ขึ้นในค่าที่อ่านกลับ
 */
function asPlainText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value
}

/** นับการเขียนในนาทีนี้ — เกินโควตาได้ false */
function takeQuota() {
  var cache = CacheService.getScriptCache()
  var key = 'write-quota-' + Math.floor(Date.now() / 60000)
  var used = Number(cache.get(key) || 0)
  if (used >= MAX_WRITES_PER_MINUTE) return false
  cache.put(key, String(used + 1), 120)
  return true
}

function fail(message) {
  return json({ ok: false, error: message })
}

/** ตอบกลับเป็น JSON */
function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}
