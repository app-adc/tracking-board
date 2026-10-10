// ทดสอบ Code.gs กับ Google Sheets จำลองใน node (ไม่ต้องใช้บัญชี Google)
// ใช้: node scripts/test-code-gs.js <path ของ Code.gs>  → ผ่านทั้งหมดพิมพ์ ALL PASS · พังโยน AssertionError บอกข้อที่ไม่ผ่าน
// จำลอง SpreadsheetApp · LockService · CacheService · Utilities · ContentService แบบบางๆ พอให้ตรวจ logic
// จำลอง Google Sheets แบบบางๆ เพื่อรัน Code.gs ใน node
const fs = require('fs')
const vm = require('vm')
const assert = require('assert')

class Range {
  constructor(sheet, r, c, nr = 1, nc = 1) { Object.assign(this, { sheet, r, c, nr, nc }) }
  getValues() {
    const out = []
    for (let i = 0; i < this.nr; i++) {
      const row = []
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.get(this.r + i, this.c + j))
      out.push(row)
    }
    return out
  }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sheet.set(this.r + i, this.c + j, x))); return this }
  setValue(x) {
    // จำลองชีต: ข้อความขึ้นต้น ' = เก็บเป็นข้อความ (ตัด ' ออกตอนอ่าน) · ขึ้นต้น = = สูตร (ทดสอบว่าไม่หลุด)
    if (typeof x === 'string' && x.startsWith('=')) throw new Error('FORMULA INJECTED: ' + x)
    if (typeof x === 'string' && x.startsWith("'")) x = x.slice(1)
    this.sheet.set(this.r, this.c, x); return this
  }
  setNumberFormat() { return this }
  insertCheckboxes() { return this }
  setDataValidation() { return this }
  setFontWeight() { return this }
}
class Sheet {
  constructor(name) { this.name = name; this.data = [] }
  get(r, c) { return (this.data[r - 1] || [])[c - 1] ?? '' }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v }
  getLastRow() { return this.data.length }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)) }
  getMaxRows() { return 1000 }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc) }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()) }
  appendRow(row) { this.data.push([...row]) }
  setFrozenRows() {}
}
const sheets = {}
const book = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = new Sheet(n)),
}
const cache = {}
const ctx = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => book,
    newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b },
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => (cache[k] = v) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + 'abcdef' },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ setMimeType: () => ({ body: JSON.parse(t) }) }),
  },
  Date, JSON, Math, String, Number, Object, console,
}
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx)

const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body
const list = () => ctx.doGet({ parameter: { action: 'list' } }).body

ctx.setupSheets()
assert.deepStrictEqual(sheets.items.data[0].slice(0, 3), ['id', 'publish', 'type'])

// ชีตเวอร์ชันเก่าที่ไม่มีคอลัมน์ createdBy ฯลฯ → setup ซ้ำเติมให้ + แถวที่ทีมกรอกเอง (ซ่อนอยู่ 1 แถว)
sheets.items.data[0] = sheets.items.data[0].slice(0, 14)
ctx.setupSheets()
assert.strictEqual(sheets.items.data[0].length, 19)
sheets.items.appendRow(['T-001', true, 'คำถาม', 'DO', 'ใบส่งของ 2 แบบ', '', 'รอลูกค้าตอบ', 'สูง', '', '', '', 'v0.3', '', ''])
sheets.items.appendRow(['T-007', false, 'คำถาม', '', 'เรื่องภายใน', '', 'รอทีมเรา', '', '', '', '', '', '', ''])

let r = list()
assert.strictEqual(r.items.length, 1, 'ส่งเฉพาะแถวที่ publish')
assert.strictEqual(r.items[0].publish, undefined)
assert.strictEqual(r.items[0]._row, undefined)

// คอมเมนต์ไม่มีชื่อ → ปฏิเสธ · สร้างเรื่องไม่ต้องมีชื่อ
assert.strictEqual(post({ action: 'comment', author: '', itemId: 'T-001', message: 'x' }).ok, false)
assert.match(post({ action: 'comment', author: '   ', itemId: 'T-001', message: 'x' }).error, /ชื่อผู้คอมเมนต์/)
// สร้าง → รหัสต่อจากเลขสูงสุดรวมแถวที่ซ่อน (T-007 → T-008)
r = post({ action: 'createItem', author: 'สมชาย', item: { title: '=HYPERLINK("x")', type: 'request', status: 'waiting_team', priority: 'high', askedAt: '2026-10-09', dueAt: '2026-10-20', module: 'สต็อก' } })
assert.ok(r.ok, JSON.stringify(r))
assert.strictEqual(r.item.id, 'T-008')
assert.strictEqual(r.item.title, '=HYPERLINK("x")')
assert.strictEqual(r.item.status, 'รอทีมเรา')
assert.strictEqual(r.item.type, 'ขอเพิ่ม')
assert.strictEqual(r.item.createdBy, 'สมชาย')
assert.strictEqual(post({ action: 'createItem', item: { title: 'ไม่มีชื่อ' } }).ok, false, 'สร้างต้องมีชื่อ')
assert.strictEqual(post({ action: 'createItem', author: 'x'.repeat(61), item: { title: 'a' } }).ok, false, 'ชื่อยาวเกิน')
assert.ok(r.item.askedAt.startsWith('2026-10-0')); assert.ok(r.item.dueAt.startsWith('2026-10-'), 'dueAt'); assert.strictEqual(post({ action: 'createItem', author: 'สมชาย', item: { title: 'a', dueAt: '20/10/2026' } }).ok, false, 'dueAt ผิดรูปแบบ')
assert.strictEqual(r.item._row, undefined)
const created = r.item

// ค่าตัวเลือกผิด → ปฏิเสธ
assert.strictEqual(post({ action: 'createItem', author: 'สมชาย', item: { title: 'a', status: 'hacked' } }).ok, false)
assert.strictEqual(post({ action: 'createItem', author: 'สมชาย', item: { title: '' } }).ok, false)
assert.strictEqual(post({ action: 'createItem', author: 'สมชาย', item: { title: 'a', link: 'javascript:alert(1)' } }).ok, false)

// แก้สถานะ → มี log
r = post({ action: 'updateItem', author: 'ลูกค้า', id: 'T-008', baseUpdatedAt: created.updatedAt, changes: { status: 'done' } })
assert.ok(r.ok, JSON.stringify(r))
assert.strictEqual(r.item.status, 'เสร็จแล้ว')
assert.strictEqual(r.item.title, created.title, 'ช่องที่ไม่ส่งมาไม่ถูกล้าง')
assert.strictEqual(r.item.updatedBy, 'ลูกค้า', 'แก้จากฟอร์มมีชื่อ')
assert.strictEqual(r.log.author, 'ลูกค้า')
assert.strictEqual(r.log.message, 'ย้ายสถานะ: รอทีมเรา → เสร็จแล้ว')
const updated = r.item

// แก้ด้วย updatedAt เก่า → กันแก้ทับ
r = post({ action: 'updateItem', author: 'คนอื่น', id: 'T-008', baseUpdatedAt: created.updatedAt, changes: { title: 'ทับ' } })
assert.strictEqual(r.ok, false)
assert.match(r.error, /แก้เรื่องนี้ไปก่อน/)

// แถวที่ทีมกรอกเอง (updatedAt ว่าง) แก้ได้ด้วย baseUpdatedAt ว่าง
r = post({ action: 'updateItem', id: 'T-001', baseUpdatedAt: '', changes: { status: 'in_progress' } })
assert.ok(r.ok, JSON.stringify(r))
assert.strictEqual(r.item.updatedBy, '', 'ลากไม่ระบุชื่อ')
assert.strictEqual(r.log.author, '')
assert.strictEqual(r.log.message, 'ย้ายสถานะ: รอลูกค้าตอบ → กำลังทำ')

// แก้เรื่องที่ซ่อนอยู่ไม่ได้
assert.strictEqual(post({ action: 'updateItem', author: 'สมชาย', id: 'T-007', baseUpdatedAt: '', changes: { title: 'x' } }).ok, false)

// คอมเมนต์ + กันสูตร
r = post({ action: 'comment', author: 'ลูกค้า', itemId: 'T-008', message: '=1+1 ok' })
assert.ok(r.ok, JSON.stringify(r))
assert.strictEqual(r.comment.author, 'ลูกค้า')
assert.strictEqual(post({ action: 'comment', author: 'ลูกค้า', itemId: 'T-007', message: 'hi' }).ok, false, 'คอมเมนต์เรื่องที่ซ่อนไม่ได้')

// ซ่อน
r = post({ action: 'archiveItem', id: 'T-008', baseUpdatedAt: updated.updatedAt })
assert.ok(r.ok, JSON.stringify(r))
r = list()
assert.deepStrictEqual(r.items.map((i) => i.id), ['T-001'])
assert.ok(r.comments.every((c) => c.itemId === 'T-001'), 'คอมเมนต์ของเรื่องที่ซ่อนไม่หลุด')

// โควตา
for (let i = 0; i < 70; i++) post({ action: 'comment', author: 'spam', itemId: 'T-001', message: 'x' })
r = post({ action: 'comment', author: 'spam', itemId: 'T-001', message: 'x' })
assert.strictEqual(r.ok, false)

console.log('ALL PASS')
