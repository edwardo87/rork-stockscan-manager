/**
 * Chapter 4 — deterministic, on-device PDF text extraction.
 *
 * Reads the text layer of digitally generated PDFs (supplier price lists
 * exported from accounting / ERP systems) and returns positioned text rows.
 * There is NO OCR and NO AI here: values are only ever taken from text the
 * PDF actually contains, so nothing can be invented. Scanned (image-only)
 * and encrypted PDFs are reported as limitations instead of being guessed.
 *
 * Supported: FlateDecode content streams, object streams (PDF 1.5+),
 * ToUnicode CMaps (bfchar / bfrange), simple fonts (WinAnsi / standard),
 * Type0 two-byte fonts, /Widths and /W glyph widths, text operators
 * BT/ET Tf Td TD Tm T* TL Tj TJ ' " and graphics state cm q Q.
 */
import { unzlibSync, inflateSync } from 'fflate';

export type PdfLimitationKind = 'encrypted' | 'no-text' | 'unreadable';

export class PdfLimitationError extends Error {
  kind: PdfLimitationKind;
  constructor(kind: PdfLimitationKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'PdfLimitationError';
  }
}

export interface PdfTextCell {
  x: number;
  xEnd: number;
  text: string;
}

export interface PdfTextRow {
  page: number;
  y: number;
  cells: PdfTextCell[];
}

// ---------------------------------------------------------------------------
// Minimal PDF object model
// ---------------------------------------------------------------------------

interface PdfName { kind: 'name'; name: string }
interface PdfRef { kind: 'ref'; num: number }
interface PdfStr { kind: 'str'; bytes: number[] }
interface PdfDict { kind: 'dict'; map: Record<string, PdfValue> }
type PdfValue = number | boolean | null | PdfName | PdfRef | PdfStr | PdfDict | PdfValue[] | { kind: 'op'; op: string };

interface PdfObject {
  value: PdfValue;
  stream?: Uint8Array;
}

const isDict = (v: PdfValue | undefined): v is PdfDict =>
  !!v && typeof v === 'object' && !Array.isArray(v) && (v as PdfDict).kind === 'dict';
const isName = (v: PdfValue | undefined): v is PdfName =>
  !!v && typeof v === 'object' && !Array.isArray(v) && (v as PdfName).kind === 'name';
const isRef = (v: PdfValue | undefined): v is PdfRef =>
  !!v && typeof v === 'object' && !Array.isArray(v) && (v as PdfRef).kind === 'ref';
const isStr = (v: PdfValue | undefined): v is PdfStr =>
  !!v && typeof v === 'object' && !Array.isArray(v) && (v as PdfStr).kind === 'str';

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** Byte-level tokenizer/parser shared by object bodies and content streams. */
class Lexer {
  pos = 0;
  constructor(public data: Uint8Array, start = 0, public end = data.length) {
    this.pos = start;
  }

  skipWs(): void {
    const d = this.data;
    while (this.pos < this.end) {
      const c = d[this.pos];
      if (WS.has(c)) {
        this.pos++;
      } else if (c === 0x25) {
        // comment to end of line
        while (this.pos < this.end && d[this.pos] !== 0x0a && d[this.pos] !== 0x0d) this.pos++;
      } else {
        break;
      }
    }
  }

  /** Reads one value; bare keywords are returned as { kind:'op' }. */
  read(): PdfValue | undefined {
    this.skipWs();
    if (this.pos >= this.end) return undefined;
    const d = this.data;
    const c = d[this.pos];

    if (c === 0x2f) { // name
      this.pos++;
      let s = '';
      while (this.pos < this.end && !WS.has(d[this.pos]) && !DELIM.has(d[this.pos])) {
        if (d[this.pos] === 0x23 && this.pos + 2 < this.end) { // #xx escape
          s += String.fromCharCode(parseInt(String.fromCharCode(d[this.pos + 1], d[this.pos + 2]), 16));
          this.pos += 3;
        } else {
          s += String.fromCharCode(d[this.pos++]);
        }
      }
      return { kind: 'name', name: s };
    }
    if (c === 0x3c && d[this.pos + 1] === 0x3c) { // dict
      this.pos += 2;
      const map: Record<string, PdfValue> = {};
      for (;;) {
        this.skipWs();
        if (this.pos >= this.end) break;
        if (d[this.pos] === 0x3e && d[this.pos + 1] === 0x3e) { this.pos += 2; break; }
        const key = this.read();
        if (!isName(key)) { if (key === undefined) break; continue; }
        const val = this.readWithRefs();
        if (val !== undefined) map[key.name] = val;
      }
      return { kind: 'dict', map };
    }
    if (c === 0x3c) { // hex string
      this.pos++;
      let hex = '';
      while (this.pos < this.end && d[this.pos] !== 0x3e) {
        const ch = d[this.pos++];
        if (!WS.has(ch)) hex += String.fromCharCode(ch);
      }
      this.pos++;
      if (hex.length % 2) hex += '0';
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16) || 0);
      return { kind: 'str', bytes };
    }
    if (c === 0x28) { // literal string
      this.pos++;
      const bytes: number[] = [];
      let depth = 1;
      while (this.pos < this.end) {
        const ch = d[this.pos++];
        if (ch === 0x5c) { // backslash
          const n = d[this.pos++];
          if (n === 0x6e) bytes.push(0x0a);
          else if (n === 0x72) bytes.push(0x0d);
          else if (n === 0x74) bytes.push(0x09);
          else if (n === 0x62) bytes.push(0x08);
          else if (n === 0x66) bytes.push(0x0c);
          else if (n === 0x0d) { if (d[this.pos] === 0x0a) this.pos++; }
          else if (n === 0x0a) { /* line continuation */ }
          else if (n >= 0x30 && n <= 0x37) {
            let oct = String.fromCharCode(n);
            for (let k = 0; k < 2 && d[this.pos] >= 0x30 && d[this.pos] <= 0x37; k++) oct += String.fromCharCode(d[this.pos++]);
            bytes.push(parseInt(oct, 8) & 0xff);
          } else bytes.push(n);
        } else if (ch === 0x28) { depth++; bytes.push(ch); }
        else if (ch === 0x29) { depth--; if (depth === 0) break; bytes.push(ch); }
        else bytes.push(ch);
      }
      return { kind: 'str', bytes };
    }
    if (c === 0x5b) { // array
      this.pos++;
      const arr: PdfValue[] = [];
      for (;;) {
        this.skipWs();
        if (this.pos >= this.end) break;
        if (d[this.pos] === 0x5d) { this.pos++; break; }
        const v = this.readWithRefs();
        if (v === undefined) break;
        arr.push(v);
      }
      return arr;
    }
    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) {
      this.pos++;
      return { kind: 'op', op: String.fromCharCode(c) };
    }
    // number or keyword
    let s = '';
    while (this.pos < this.end && !WS.has(d[this.pos]) && !DELIM.has(d[this.pos])) {
      s += String.fromCharCode(d[this.pos++]);
    }
    if (s === '') { this.pos++; return { kind: 'op', op: '' }; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    return { kind: 'op', op: s };
  }

  /** Like read(), but folds "num gen R" into a reference (object syntax only). */
  readWithRefs(): PdfValue | undefined {
    const v = this.read();
    if (typeof v === 'number' && Number.isInteger(v)) {
      const save = this.pos;
      const g = this.read();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.read();
        if (r && typeof r === 'object' && !Array.isArray(r) && (r as { kind: string }).kind === 'op' && (r as { op: string }).op === 'R') {
          return { kind: 'ref', num: v };
        }
      }
      this.pos = save;
    }
    return v;
  }
}

function toLatin1(bytes: Uint8Array): string {
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  }
  return out;
}

function inflate(data: Uint8Array): Uint8Array | null {
  try { return unzlibSync(data); } catch { /* try raw */ }
  try { return inflateSync(data); } catch { /* fallthrough */ }
  try { return inflateSync(data.subarray(2)); } catch { return null; }
}

class PdfDocument {
  objects = new Map<number, PdfObject>();
  latin: string;

  constructor(public data: Uint8Array) {
    this.latin = toLatin1(data);
    this.parseObjects();
    this.parseObjectStreams();
  }

  private parseObjects(): void {
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.latin)) !== null) {
      const num = parseInt(m[1], 10);
      const lex = new Lexer(this.data, m.index + m[0].length);
      let value: PdfValue | undefined;
      try { value = lex.readWithRefs(); } catch { continue; }
      if (value === undefined) continue;
      const obj: PdfObject = { value };
      // stream?
      lex.skipWs();
      if (this.latin.startsWith('stream', lex.pos)) {
        let start = lex.pos + 6;
        if (this.data[start] === 0x0d) start++;
        if (this.data[start] === 0x0a) start++;
        let length = isDict(value) ? value.map.Length : undefined;
        let len = typeof length === 'number' ? length : -1;
        if (isRef(length)) len = -2; // resolved after all objects are known
        let end = len >= 0 ? start + len : -1;
        if (end < 0 || end > this.data.length || !this.latin.startsWith('endstream', this.skipWsFrom(end))) {
          const es = this.latin.indexOf('endstream', start);
          end = es < 0 ? this.data.length : es;
          // trim trailing EOL
          while (end > start && (this.data[end - 1] === 0x0a || this.data[end - 1] === 0x0d)) end--;
        }
        obj.stream = this.data.subarray(start, end);
        re.lastIndex = end;
      }
      // Later definitions win (incremental updates).
      this.objects.set(num, obj);
    }
  }

  private skipWsFrom(pos: number): number {
    while (pos < this.data.length && WS.has(this.data[pos])) pos++;
    return pos;
  }

  private parseObjectStreams(): void {
    for (const obj of Array.from(this.objects.values())) {
      if (!isDict(obj.value) || !obj.stream) continue;
      const t = obj.value.map.Type;
      if (!isName(t) || t.name !== 'ObjStm') continue;
      const data = this.decodeStream(obj);
      if (!data) continue;
      const n = this.resolve(obj.value.map.N);
      const first = this.resolve(obj.value.map.First);
      if (typeof n !== 'number' || typeof first !== 'number') continue;
      const header = new Lexer(data, 0, first);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const on = header.read();
        const off = header.read();
        if (typeof on !== 'number' || typeof off !== 'number') break;
        pairs.push([on, off]);
      }
      for (const [on, off] of pairs) {
        if (this.objects.has(on)) continue;
        try {
          const v = new Lexer(data, first + off).readWithRefs();
          if (v !== undefined) this.objects.set(on, { value: v });
        } catch { /* skip */ }
      }
    }
  }

  resolve(v: PdfValue | undefined, depth = 0): PdfValue | undefined {
    if (isRef(v) && depth < 20) return this.resolve(this.objects.get(v.num)?.value, depth + 1);
    return v;
  }

  getObject(v: PdfValue | undefined): PdfObject | undefined {
    if (isRef(v)) return this.objects.get(v.num);
    return undefined;
  }

  decodeStream(obj: PdfObject): Uint8Array | null {
    if (!obj.stream) return null;
    const dict = isDict(obj.value) ? obj.value : undefined;
    let filters = dict ? this.resolve(dict.map.Filter) : undefined;
    if (filters === undefined || filters === null) return obj.stream;
    const list = Array.isArray(filters) ? filters : [filters];
    let data: Uint8Array | null = obj.stream;
    for (const f of list) {
      const fv = this.resolve(f);
      if (!isName(fv) || !data) return null;
      if (fv.name === 'FlateDecode' || fv.name === 'Fl') data = inflate(data);
      else return null; // unsupported filter (images etc.)
    }
    return data;
  }

  get isEncrypted(): boolean {
    return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(this.latin);
  }

  /** Page dictionaries in page-tree order, with inherited Resources resolved. */
  pages(): { dict: PdfDict; resources?: PdfDict }[] {
    const out: { dict: PdfDict; resources?: PdfDict }[] = [];
    const seen = new Set<PdfDict>();
    const walk = (node: PdfValue | undefined, inherited: PdfDict | undefined, depth: number) => {
      const d = this.resolve(node);
      if (!isDict(d) || seen.has(d) || depth > 50) return;
      seen.add(d);
      const resV = this.resolve(d.map.Resources);
      const res = isDict(resV) ? resV : inherited;
      const type = d.map.Type;
      const kids = this.resolve(d.map.Kids);
      if (Array.isArray(kids)) {
        kids.forEach(k => walk(k, res, depth + 1));
      } else if (!isName(type) || type.name === 'Page') {
        out.push({ dict: d, resources: res });
      }
    };
    // Root via trailer or catalog object.
    let root: PdfValue | undefined;
    const tm = /trailer\s*<</g;
    let mm: RegExpExecArray | null;
    while ((mm = tm.exec(this.latin)) !== null) {
      const v = new Lexer(this.data, mm.index + 7).readWithRefs();
      if (isDict(v) && v.map.Root) root = v.map.Root;
    }
    if (!root) {
      for (const o of this.objects.values()) {
        if (isDict(o.value)) {
          const t = o.value.map.Type;
          if (isName(t) && t.name === 'XRef' && o.value.map.Root) root = o.value.map.Root;
          if (isName(t) && t.name === 'Catalog') root = o.value;
        }
      }
    }
    const cat = this.resolve(root);
    if (isDict(cat)) walk(cat.map.Pages, undefined, 0);
    if (out.length === 0) {
      // Fallback: every /Type /Page object in file order.
      for (const o of this.objects.values()) {
        if (isDict(o.value) && isName(o.value.map.Type) && (o.value.map.Type as PdfName).name === 'Page') {
          const r = this.resolve(o.value.map.Resources);
          out.push({ dict: o.value, resources: isDict(r) ? r : undefined });
        }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

// WinAnsi differences from Latin-1 in 0x80–0x9F.
const WIN_ANSI: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

interface FontInfo {
  twoByte: boolean;
  toUnicode?: Map<number, string>;
  widths: Map<number, number>;
  defaultWidth: number;
}

function parseCMap(data: Uint8Array): Map<number, string> {
  const map = new Map<number, string>();
  const text = toLatin1(data);
  const hexToStr = (hex: string): string => {
    let s = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    if (hex.length % 4 === 2) s += String.fromCharCode(parseInt(hex.slice(-2), 16));
    return s;
  };
  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of charBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) map.set(parseInt(m[1], 16), hexToStr(m[2]));
  }
  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of rangeBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      if (m[4] !== undefined) {
        const base = hexToStr(m[4]);
        const lastCode = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c++) {
          map.set(c, base.slice(0, -1) + String.fromCharCode(lastCode + (c - lo)));
        }
      } else if (m[5] !== undefined) {
        const items = m[5].match(/<([0-9a-fA-F]*)>/g) || [];
        items.forEach((it, i) => map.set(lo + i, hexToStr(it.slice(1, -1))));
      }
    }
  }
  return map;
}

function loadFont(doc: PdfDocument, ref: PdfValue | undefined): FontInfo {
  const font = doc.resolve(ref);
  const info: FontInfo = { twoByte: false, widths: new Map(), defaultWidth: 500 };
  if (!isDict(font)) return info;
  const subtype = font.map.Subtype;
  info.twoByte = isName(subtype) && subtype.name === 'Type0';
  const tu = doc.getObject(font.map.ToUnicode);
  if (tu) {
    const data = doc.decodeStream(tu);
    if (data) info.toUnicode = parseCMap(data);
  }
  if (info.twoByte) {
    const descV = doc.resolve(font.map.DescendantFonts);
    const desc = Array.isArray(descV) ? doc.resolve(descV[0]) : undefined;
    if (isDict(desc)) {
      const dw = doc.resolve(desc.map.DW);
      info.defaultWidth = typeof dw === 'number' ? dw : 1000;
      const w = doc.resolve(desc.map.W);
      if (Array.isArray(w)) {
        for (let i = 0; i < w.length;) {
          const a = doc.resolve(w[i]);
          const b = doc.resolve(w[i + 1]);
          if (typeof a !== 'number') break;
          if (Array.isArray(b)) {
            b.forEach((wv, k) => { const n = doc.resolve(wv); if (typeof n === 'number') info.widths.set(a + k, n); });
            i += 2;
          } else {
            const c = doc.resolve(w[i + 2]);
            if (typeof b === 'number' && typeof c === 'number') for (let k = a; k <= b; k++) info.widths.set(k, c);
            i += 3;
          }
        }
      }
    }
  } else {
    const fc = doc.resolve(font.map.FirstChar);
    const ws = doc.resolve(font.map.Widths);
    if (typeof fc === 'number' && Array.isArray(ws)) {
      ws.forEach((wv, k) => { const n = doc.resolve(wv); if (typeof n === 'number') info.widths.set(fc + k, n); });
    }
    const base = doc.resolve(font.map.BaseFont);
    if (isName(base) && /Courier/i.test(base.name)) info.defaultWidth = 600;
  }
  return info;
}

function decodeText(font: FontInfo, bytes: number[]): { text: string; width: number; spaces: number } {
  let text = '';
  let width = 0;
  let spaces = 0;
  const step = font.twoByte ? 2 : 1;
  for (let i = 0; i + step - 1 < bytes.length; i += step) {
    const code = step === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i];
    let ch: string;
    if (font.toUnicode && font.toUnicode.has(code)) ch = font.toUnicode.get(code) as string;
    else if (step === 1) ch = WIN_ANSI[code] ?? String.fromCharCode(code);
    else ch = '';
    if (ch === ' ') spaces++;
    text += ch;
    width += font.widths.get(code) ?? font.defaultWidth;
  }
  return { text, width: width / 1000, spaces };
}

// ---------------------------------------------------------------------------
// Content stream interpretation
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number];
const IDENT: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

interface Run { x: number; xEnd: number; y: number; size: number; text: string }

function interpretPage(doc: PdfDocument, content: Uint8Array, resources: PdfDict | undefined): Run[] {
  const runs: Run[] = [];
  const fontCache = new Map<string, FontInfo>();
  const fontsDict = resources ? doc.resolve(resources.map.Font) : undefined;
  const getFont = (name: string): FontInfo => {
    if (!fontCache.has(name)) {
      const ref = isDict(fontsDict) ? fontsDict.map[name] : undefined;
      fontCache.set(name, loadFont(doc, ref));
    }
    return fontCache.get(name) as FontInfo;
  };

  let ctm: Matrix = IDENT;
  const stack: Matrix[] = [];
  let tm: Matrix = IDENT;
  let tlm: Matrix = IDENT;
  let font: FontInfo = { twoByte: false, widths: new Map(), defaultWidth: 500 };
  let size = 10;
  let leading = 0;
  let charSpace = 0;
  let wordSpace = 0;
  let hScale = 1;

  const show = (bytes: number[]) => {
    const { text, width, spaces } = decodeText(font, bytes);
    const advance = width * size + charSpace * (font.twoByte ? bytes.length / 2 : bytes.length) + wordSpace * spaces;
    const m = mul(tm, ctm);
    const scaleX = Math.hypot(m[0], m[1]) || 1;
    const effSize = size * (Math.hypot(m[2], m[3]) || 1);
    if (text.length) {
      runs.push({ x: m[4], xEnd: m[4] + advance * hScale * scaleX, y: m[5], size: effSize, text });
    }
    tm = mul([1, 0, 0, 1, advance * hScale, 0], tm);
  };
  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  const lex = new Lexer(content);
  let operands: PdfValue[] = [];
  for (let guard = 0; guard < 2_000_000; guard++) {
    const v = lex.read();
    if (v === undefined) break;
    if (v && typeof v === 'object' && !Array.isArray(v) && (v as { kind: string }).kind === 'op') {
      const op = (v as { op: string }).op;
      const nums = operands.filter((o): o is number => typeof o === 'number');
      switch (op) {
        case 'q': stack.push(ctm); break;
        case 'Q': ctm = stack.pop() ?? IDENT; break;
        case 'cm': if (nums.length >= 6) ctm = mul(nums.slice(-6) as Matrix, ctm); break;
        case 'BT': tm = IDENT; tlm = IDENT; break;
        case 'Tf': {
          const n = operands.find(isName);
          if (n) font = getFont(n.name);
          if (nums.length) size = nums[nums.length - 1];
          break;
        }
        case 'TL': if (nums.length) leading = nums[0]; break;
        case 'Tc': if (nums.length) charSpace = nums[0]; break;
        case 'Tw': if (nums.length) wordSpace = nums[0]; break;
        case 'Tz': if (nums.length) hScale = nums[0] / 100; break;
        case 'Td': if (nums.length >= 2) nextLine(nums[0], nums[1]); break;
        case 'TD': if (nums.length >= 2) { leading = -nums[1]; nextLine(nums[0], nums[1]); } break;
        case 'Tm': if (nums.length >= 6) { tlm = nums.slice(-6) as Matrix; tm = tlm; } break;
        case 'T*': nextLine(0, -leading); break;
        case 'Tj': { const s = operands.find(isStr); if (s) show(s.bytes); break; }
        case "'": { nextLine(0, -leading); const s = operands.find(isStr); if (s) show(s.bytes); break; }
        case '"': {
          if (nums.length >= 2) { wordSpace = nums[0]; charSpace = nums[1]; }
          nextLine(0, -leading);
          const s = operands.find(isStr);
          if (s) show(s.bytes);
          break;
        }
        case 'TJ': {
          const arr = operands.find((o): o is PdfValue[] => Array.isArray(o));
          if (arr) {
            for (const item of arr) {
              if (isStr(item)) show(item.bytes);
              else if (typeof item === 'number') tm = mul([1, 0, 0, 1, (-item / 1000) * size * hScale, 0], tm);
            }
          }
          break;
        }
        case 'BI': {
          // Skip inline image data up to EI.
          const idx = doc.latin.length ? toLatin1(content.subarray(lex.pos)).search(/\sEI(\s|$)/) : -1;
          lex.pos = idx < 0 ? content.length : lex.pos + idx + 3;
          break;
        }
        default: break;
      }
      operands = [];
    } else {
      operands.push(v);
      if (operands.length > 64) operands.shift();
    }
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function runsToRows(runs: Run[], page: number): PdfTextRow[] {
  const sorted = runs
    .filter(r => r.text.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; size: number; runs: Run[] }[] = [];
  for (const r of sorted) {
    const tol = Math.max(2, r.size * 0.4);
    const row = rows.find(rw => Math.abs(rw.y - r.y) <= tol);
    if (row) row.runs.push(r);
    else rows.push({ y: r.y, size: r.size, runs: [r] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(rw => {
    const rs = rw.runs.sort((a, b) => a.x - b.x);
    const cells: PdfTextCell[] = [];
    for (const r of rs) {
      const last = cells[cells.length - 1];
      const gap = last ? r.x - last.xEnd : Infinity;
      const joinGap = Math.max(1.5, rw.size * 0.35);
      if (last && gap < joinGap) {
        const needsSpace = gap > rw.size * 0.12 && !last.text.endsWith(' ') && !r.text.startsWith(' ');
        last.text += (needsSpace ? ' ' : '') + r.text;
        last.xEnd = Math.max(last.xEnd, r.xEnd);
      } else {
        cells.push({ x: r.x, xEnd: r.xEnd, text: r.text });
      }
    }
    // Split cells containing wide internal gaps of 3+ spaces (fixed-width layouts).
    const split: PdfTextCell[] = [];
    for (const c of cells) {
      const parts = c.text.split(/\s{3,}/);
      if (parts.length === 1) { split.push({ ...c, text: c.text.trim() }); continue; }
      const charW = (c.xEnd - c.x) / Math.max(1, c.text.length);
      let offset = 0;
      for (const p of parts) {
        const at = c.text.indexOf(p, offset);
        offset = at + p.length;
        if (p.trim()) split.push({ x: c.x + at * charW, xEnd: c.x + offset * charW, text: p.trim() });
      }
    }
    return { page, y: rw.y, cells: split.filter(c => c.text.length > 0) };
  });
}

/**
 * Extracts positioned text rows from every page of a PDF.
 * Throws PdfLimitationError for encrypted, unreadable, or image-only files.
 */
export function extractPdfTextRows(data: Uint8Array): PdfTextRow[] {
  const head = toLatin1(data.subarray(0, 1024));
  if (!head.includes('%PDF')) {
    throw new PdfLimitationError('unreadable', 'This file is not a valid PDF.');
  }
  let doc: PdfDocument;
  try {
    doc = new PdfDocument(data);
  } catch {
    throw new PdfLimitationError('unreadable', 'This PDF could not be read.');
  }
  if (doc.isEncrypted) {
    throw new PdfLimitationError(
      'encrypted',
      'This PDF is password-protected or encrypted, so its text cannot be read on the device.',
    );
  }
  const pages = doc.pages();
  const rows: PdfTextRow[] = [];
  pages.forEach((p, idx) => {
    const contents = doc.resolve(p.dict.map.Contents) ?? p.dict.map.Contents;
    const refs: PdfValue[] = Array.isArray(contents) ? contents : [p.dict.map.Contents];
    const parts: Uint8Array[] = [];
    for (const r of refs) {
      const obj = doc.getObject(r);
      const decoded = obj ? doc.decodeStream(obj) : null;
      if (decoded) parts.push(decoded);
    }
    const total = parts.reduce((n, a) => n + a.length + 1, 0);
    const content = new Uint8Array(total);
    let off = 0;
    for (const part of parts) { content.set(part, off); off += part.length; content[off++] = 0x0a; }
    try {
      rows.push(...runsToRows(interpretPage(doc, content, p.resources), idx + 1));
    } catch {
      /* unreadable page — skipped */
    }
  });
  if (rows.length === 0) {
    throw new PdfLimitationError(
      'no-text',
      'No readable text was found in this PDF. It is probably a scanned image, which SmartStock cannot read reliably.',
    );
  }
  return rows;
}
