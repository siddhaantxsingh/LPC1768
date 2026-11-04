// HD44780-compatible 16x2 character LCD driven in 4-bit mode (RW tied to ground).

export class HD44780 {
  ddram = new Uint8Array(128).fill(0x20);
  cgram = new Uint8Array(64);
  ac = 0;
  cgMode = false;
  increment = true;
  shiftOnWrite = false;
  displayOn = false;
  cursorOn = false;
  blinkOn = false;
  shift = 0;
  eightBit = true;
  twoLine = false;
  highNibble = 0;
  awaitingLow = false;
  version = 0;          // bumps whenever the visible content changes
  writes = 0;
  lastCmd = -1;

  reset() {
    this.ddram.fill(0x20);
    this.cgram.fill(0);
    this.ac = 0; this.cgMode = false; this.increment = true; this.shiftOnWrite = false;
    this.displayOn = false; this.cursorOn = false; this.blinkOn = false; this.shift = 0;
    this.eightBit = true; this.twoLine = false; this.awaitingLow = false; this.version++;
  }

  /** Falling edge on E. nibble = D7..D4, rs = register select. */
  strobe(rs: boolean, nibble: number) {
    if (this.eightBit) {
      this.exec(rs, (nibble & 0xf) << 4);
      return;
    }
    if (!this.awaitingLow) { this.highNibble = nibble & 0xf; this.awaitingLow = true; return; }
    this.awaitingLow = false;
    this.exec(rs, (this.highNibble << 4) | (nibble & 0xf));
  }

  private wrapAc() {
    if (this.twoLine) {
      if (this.ac > 0x67) this.ac = 0x00;
      else if (this.ac > 0x27 && this.ac < 0x40) this.ac = this.increment ? 0x40 : 0x27;
      if (this.ac < 0) this.ac = 0x67;
    } else {
      this.ac = ((this.ac % 80) + 80) % 80;
    }
  }

  exec(rs: boolean, b: number) {
    this.writes++;
    if (rs) {
      if (this.cgMode) {
        this.cgram[this.ac & 0x3f] = b & 0x1f;
        this.ac = (this.ac + (this.increment ? 1 : -1)) & 0x3f;
      } else {
        this.ddram[this.ac & 0x7f] = b;
        this.ac += this.increment ? 1 : -1;
        this.wrapAc();
        if (this.shiftOnWrite) this.shift += this.increment ? 1 : -1;
      }
      this.version++;
      return;
    }
    this.lastCmd = b;
    if (b & 0x80) { this.cgMode = false; this.ac = b & 0x7f; this.wrapAc(); this.version++; return; }
    if (b & 0x40) { this.cgMode = true; this.ac = b & 0x3f; return; }
    if (b & 0x20) {
      const dl = (b & 0x10) !== 0;
      if (this.eightBit && !dl) { this.eightBit = false; this.awaitingLow = false; }
      else if (!this.eightBit && dl) { this.eightBit = true; }
      this.twoLine = (b & 0x08) !== 0;
      this.version++;
      return;
    }
    if (b & 0x10) {
      const sc = (b & 0x08) !== 0, right = (b & 0x04) !== 0;
      if (sc) this.shift += right ? -1 : 1; // display shift right moves text right
      else { this.ac += right ? 1 : -1; this.wrapAc(); }
      this.version++;
      return;
    }
    if (b & 0x08) { this.displayOn = (b & 4) !== 0; this.cursorOn = (b & 2) !== 0; this.blinkOn = (b & 1) !== 0; this.version++; return; }
    if (b & 0x04) { this.increment = (b & 2) !== 0; this.shiftOnWrite = (b & 1) !== 0; return; }
    if (b & 0x02) { this.ac = 0; this.shift = 0; this.cgMode = false; this.version++; return; }
    if (b & 0x01) { this.ddram.fill(0x20); this.ac = 0; this.shift = 0; this.increment = true; this.cgMode = false; this.version++; return; }
  }

  /** Visible characters of a row (16 columns). */
  row(r: 0 | 1): number[] {
    const out: number[] = [];
    const base = r === 0 ? 0x00 : 0x40;
    const len = this.twoLine ? 40 : 80;
    for (let c = 0; c < 16; c++) {
      let idx = ((c + this.shift) % len + len) % len;
      if (!this.twoLine && r === 1) { out.push(0x20); continue; }
      out.push(this.ddram[base + idx]);
    }
    return out;
  }

  cursorPos(): { r: number; c: number } | null {
    if (!(this.cursorOn || this.blinkOn) || this.cgMode) return null;
    const r = this.ac >= 0x40 ? 1 : 0;
    const len = this.twoLine ? 40 : 80;
    const idx = this.ac - (r ? 0x40 : 0);
    const c = ((idx - this.shift) % len + len) % len;
    return c < 16 ? { r, c } : null;
  }

  text(): string[] {
    return [0, 1].map(r => this.row(r as 0 | 1).map(ch => (ch >= 0x20 && ch < 0x7f ? String.fromCharCode(ch) : ch < 8 ? '▒' : '·')).join(''));
  }
}
