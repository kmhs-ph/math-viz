// bezout_solver.js
// Algebraic intersection / multiplicity engine for the Bézout visualizer.
//
// Strategy (see bezout_solver_claude_spec.md):
//   1. Homogenize f, g  →  F, G in Poly3.
//   2. Apply an INTEGER projective transform A (det = ±1) so the chart Z'=1 is generic.
//   3. f_A, g_A = dehomogenize(transform(F/G, A)) at Z'=1.
//   4. R(x') = Res_{y'}(f_A, g_A) via an exact BigInt Sylvester determinant.
//   5. Square-free decomposition of R over Q gives EXACT root multiplicities.
//   6. Numerical roots only locate the (already-known-multiplicity) points.
//   7. Map [x':y':1] back through A, classify, dedup, verify Bézout count.
//
// No renderer / canvas code lives here.

// ── 4.1 Complex ────────────────────────────────────────────────────────────────

export class Complex {
  constructor(re, im = 0) { this.re = re; this.im = im }
}
export function C(re, im = 0) { return new Complex(re, im) }
export function cAdd(a, b) { return new Complex(a.re + b.re, a.im + b.im) }
export function cSub(a, b) { return new Complex(a.re - b.re, a.im - b.im) }
export function cMul(a, b) { return new Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re) }
export function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im
  return new Complex((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
export function cNeg(a) { return new Complex(-a.re, -a.im) }
export function cAbs(a) { return Math.hypot(a.re, a.im) }
export function cConj(a) { return new Complex(a.re, -a.im) }
export function cScale(a, s) { return new Complex(a.re * s, a.im * s) }  // s is a real number
export function cPow(a, n) {
  let r = new Complex(1, 0)
  for (let i = 0; i < n; i++) r = cMul(r, a)
  return r
}
export function cEqApprox(a, b, eps = 1e-9) { return Math.abs(a.re - b.re) < eps && Math.abs(a.im - b.im) < eps }

// ── BigInt helpers ──────────────────────────────────────────────────────────────

function bigAbs(n) { return n < 0n ? -n : n }
function bigGcd(a, b) { a = bigAbs(a); b = bigAbs(b); while (b) { [a, b] = [b, a % b] } return a }

// ── 5. Rational + UniPolyQ ──────────────────────────────────────────────────────

export class Rational {
  constructor(num, den = 1n) {
    if (den === 0n) throw new Error('zero denominator')
    if (den < 0n) { num = -num; den = -den }
    const g = bigGcd(num, den) || 1n
    this.num = num / g
    this.den = den / g
  }
}
export function qFromBigInt(n) { return new Rational(n, 1n) }
export function qAdd(a, b) { return new Rational(a.num * b.den + b.num * a.den, a.den * b.den) }
export function qSub(a, b) { return new Rational(a.num * b.den - b.num * a.den, a.den * b.den) }
export function qMul(a, b) { return new Rational(a.num * b.num, a.den * b.den) }
export function qDiv(a, b) { return new Rational(a.num * b.den, a.den * b.num) }
export function qNeg(a) { return new Rational(-a.num, a.den) }
export function qIsZero(a) { return a.num === 0n }
export function qToNumber(a) { return Number(a.num) / Number(a.den) }

// ── 4.4 UniPoly (BigInt, ascending) ─────────────────────────────────────────────

export function uniTrim(p) { let i = p.length - 1; while (i > 0 && p[i] === 0n) i--; return p.slice(0, i + 1) }
export function uniDegree(p) { const t = uniTrim(p); return (t.length === 1 && t[0] === 0n) ? -1 : t.length - 1 }
export function uniAdd(a, b) { const n = Math.max(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push((a[i] ?? 0n) + (b[i] ?? 0n)); return uniTrim(r) }
export function uniSub(a, b) { const n = Math.max(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push((a[i] ?? 0n) - (b[i] ?? 0n)); return uniTrim(r) }
export function uniMul(a, b) {
  if (a.length === 0 || b.length === 0) return [0n]
  const r = new Array(a.length + b.length - 1).fill(0n)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]
  return uniTrim(r)
}
export function uniScale(a, c) { return uniTrim(a.map(x => x * c)) }
function uniZero() { return [0n] }

// ── UniPolyQ (Rational, ascending) ──────────────────────────────────────────────

export function uniToQ(p) { return p.map(c => qFromBigInt(c)) }
export function uniQTrim(p) { let i = p.length - 1; while (i > 0 && qIsZero(p[i])) i--; return p.slice(0, i + 1) }
export function uniQDegree(p) { const t = uniQTrim(p); return (t.length === 1 && qIsZero(t[0])) ? -1 : t.length - 1 }
export function uniQAdd(a, b) { const n = Math.max(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push(qAdd(a[i] ?? qFromBigInt(0n), b[i] ?? qFromBigInt(0n))); return uniQTrim(r) }
export function uniQSub(a, b) { const n = Math.max(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push(qSub(a[i] ?? qFromBigInt(0n), b[i] ?? qFromBigInt(0n))); return uniQTrim(r) }
export function uniQMul(a, b) {
  if (a.length === 0 || b.length === 0) return [qFromBigInt(0n)]
  const r = new Array(a.length + b.length - 1).fill(null).map(() => qFromBigInt(0n))
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = qAdd(r[i + j], qMul(a[i], b[j]))
  return uniQTrim(r)
}
export function uniQDerivative(p) {
  if (p.length <= 1) return [qFromBigInt(0n)]
  const r = []
  for (let i = 1; i < p.length; i++) r.push(qMul(p[i], qFromBigInt(BigInt(i))))
  return uniQTrim(r)
}
// long division: returns { q, r } with a = q*b + r
export function uniQDivRem(a, b) {
  a = uniQTrim(a); b = uniQTrim(b)
  const db = uniQDegree(b)
  if (db < 0) throw new Error('division by zero polynomial')
  const q = new Array(Math.max(0, a.length - b.length + 1)).fill(null).map(() => qFromBigInt(0n))
  let rem = a.slice()
  let dr = uniQDegree(rem)
  const lb = b[db]
  while (dr >= db && !(rem.length === 1 && qIsZero(rem[0]))) {
    const shift = dr - db
    const coeff = qDiv(rem[dr], lb)
    q[shift] = coeff
    for (let i = 0; i <= db; i++) {
      rem[i + shift] = qSub(rem[i + shift], qMul(coeff, b[i]))
    }
    rem = uniQTrim(rem)
    const newDr = uniQDegree(rem)
    if (newDr === dr) break  // safety
    dr = newDr
  }
  return { q: uniQTrim(q), r: uniQTrim(rem) }
}
export function uniQDivExact(a, b) {
  const { q, r } = uniQDivRem(a, b)
  if (uniQDegree(r) >= 0) {
    // remainder should be zero for exact division; tolerate via degree check
    if (!(r.length === 1 && qIsZero(r[0]))) throw new Error('non-exact polynomial division')
  }
  return q
}
export function uniQMakeMonic(p) {
  const d = uniQDegree(p)
  if (d < 0) return [qFromBigInt(0n)]
  const lead = p[d]
  return uniQTrim(p.map(c => qDiv(c, lead)))
}
export function uniQGcd(a, b) {
  a = uniQTrim(a); b = uniQTrim(b)
  while (uniQDegree(b) >= 0) {
    const { r } = uniQDivRem(a, b)
    a = b; b = r
  }
  if (uniQDegree(a) < 0) return [qFromBigInt(0n)]
  return uniQMakeMonic(a)
}

// ── 4.2 Poly2 ───────────────────────────────────────────────────────────────────

export function key2(ix, iy) { return `${ix},${iy}` }
function parseKey2(k) { const [a, b] = k.split(','); return [Number(a), Number(b)] }

export class Poly2 {
  constructor() { this.terms = new Map() }
  static zero() { return new Poly2() }
  static one() { const p = new Poly2(); p.terms.set(key2(0, 0), 1n); return p }
  static monomial(ix, iy, coeff) { const p = new Poly2(); if (coeff !== 0n) p.terms.set(key2(ix, iy), coeff); return p }
  clone() { const p = new Poly2(); for (const [k, v] of this.terms) p.terms.set(k, v); return p }
  addTerm(ix, iy, coeff) {
    if (coeff === 0n) return
    const k = key2(ix, iy)
    const nv = (this.terms.get(k) ?? 0n) + coeff
    if (nv === 0n) this.terms.delete(k); else this.terms.set(k, nv)
  }
  add(other) { const p = this.clone(); for (const [k, v] of other.terms) { const [ix, iy] = parseKey2(k); p.addTerm(ix, iy, v) } return p }
  sub(other) { const p = this.clone(); for (const [k, v] of other.terms) { const [ix, iy] = parseKey2(k); p.addTerm(ix, iy, -v) } return p }
  mul(other) {
    const p = new Poly2()
    for (const [ka, va] of this.terms) { const [ia, ja] = parseKey2(ka)
      for (const [kb, vb] of other.terms) { const [ib, jb] = parseKey2(kb)
        p.addTerm(ia + ib, ja + jb, va * vb) } }
    return p
  }
  scale(coeff) { const p = new Poly2(); for (const [k, v] of this.terms) { const [ix, iy] = parseKey2(k); p.addTerm(ix, iy, v * coeff) } return p }
  degree() { let d = -1; for (const k of this.terms.keys()) { const [ix, iy] = parseKey2(k); d = Math.max(d, ix + iy) } return d }
  degreeX() { let d = -1; for (const k of this.terms.keys()) { const [ix] = parseKey2(k); d = Math.max(d, ix) } return d }
  degreeY() { let d = -1; for (const k of this.terms.keys()) { const [, iy] = parseKey2(k); d = Math.max(d, iy) } return d }
  coeffAbsMax() { let m = 0n; for (const v of this.terms.values()) { const a = bigAbs(v); if (a > m) m = a } return m }
  isZero() { return this.terms.size === 0 }
  evaluateComplex(xC, yC) {
    let r = new Complex(0, 0)
    for (const [k, v] of this.terms) { const [ix, iy] = parseKey2(k)
      r = cAdd(r, cMul(cMul(new Complex(Number(v), 0), cPow(xC, ix)), cPow(yC, iy))) }
    return r
  }
}

// ── 4.3 Poly3 (homogeneous) ─────────────────────────────────────────────────────

export function key3(ix, iy, iz) { return `${ix},${iy},${iz}` }
function parseKey3(k) { const [a, b, c] = k.split(','); return [Number(a), Number(b), Number(c)] }

export class Poly3 {
  constructor() { this.terms = new Map() }
  static zero() { return new Poly3() }
  static one() { const p = new Poly3(); p.terms.set(key3(0, 0, 0), 1n); return p }
  static monomial(ix, iy, iz, coeff) { const p = new Poly3(); if (coeff !== 0n) p.terms.set(key3(ix, iy, iz), coeff); return p }
  clone() { const p = new Poly3(); for (const [k, v] of this.terms) p.terms.set(k, v); return p }
  addTerm(ix, iy, iz, coeff) {
    if (coeff === 0n) return
    const k = key3(ix, iy, iz)
    const nv = (this.terms.get(k) ?? 0n) + coeff
    if (nv === 0n) this.terms.delete(k); else this.terms.set(k, nv)
  }
  add(other) { const p = this.clone(); for (const [k, v] of other.terms) { const [ix, iy, iz] = parseKey3(k); p.addTerm(ix, iy, iz, v) } return p }
  sub(other) { const p = this.clone(); for (const [k, v] of other.terms) { const [ix, iy, iz] = parseKey3(k); p.addTerm(ix, iy, iz, -v) } return p }
  mul(other) {
    const p = new Poly3()
    for (const [ka, va] of this.terms) { const [ia, ja, la] = parseKey3(ka)
      for (const [kb, vb] of other.terms) { const [ib, jb, lb] = parseKey3(kb)
        p.addTerm(ia + ib, ja + jb, la + lb, va * vb) } }
    return p
  }
  scale(coeff) { const p = new Poly3(); for (const [k, v] of this.terms) { const [ix, iy, iz] = parseKey3(k); p.addTerm(ix, iy, iz, v * coeff) } return p }
  degree() { let d = -1; for (const k of this.terms.keys()) { const [ix, iy, iz] = parseKey3(k); d = Math.max(d, ix + iy + iz) } return d }
  evaluateComplexProjective(X, Y, Z) {
    let r = new Complex(0, 0)
    for (const [k, v] of this.terms) { const [ix, iy, iz] = parseKey3(k)
      r = cAdd(r, cMul(cMul(cMul(new Complex(Number(v), 0), cPow(X, ix)), cPow(Y, iy)), cPow(Z, iz))) }
    return r
  }
}

// ── Parser → Poly2 ───────────────────────────────────────────────────────────────

function tokenize(src) {
  const tokens = []; let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/\d/.test(ch)) { let n = ''; while (i < src.length && /\d/.test(src[i])) n += src[i++]; tokens.push({ t: 'num', v: BigInt(n) }) }
    else if (ch === 'x') { tokens.push({ t: 'var', v: 'x' }); i++ }
    else if (ch === 'y') { tokens.push({ t: 'var', v: 'y' }); i++ }
    else if ('+-*^()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++ }
    else throw new Error(`Unexpected character: '${ch}'`)
  }
  tokens.push({ t: 'eof' })
  return tokens
}

export function parsePolynomial2(src) {
  const tokens = tokenize(String(src).trim())
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parseExpr() {
    let left = parseTerm()
    while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v
      const right = parseTerm()
      left = op === '+' ? left.add(right) : left.sub(right)
    }
    return left
  }
  function parseTerm() {
    let left = parsePow()
    while (peek().t === 'op' && peek().v === '*') { next(); left = left.mul(parsePow()) }
    return left
  }
  function parsePow() {
    let base = parseAtom()
    if (peek().t === 'op' && peek().v === '^') {
      next()
      const e = next()
      if (e.t !== 'num') throw new Error('exponent must be a non-negative integer')
      const exp = Number(e.v)
      let r = Poly2.one()
      for (let i = 0; i < exp; i++) r = r.mul(base)
      base = r
    }
    return base
  }
  function parseAtom() {
    const tk = peek()
    if (tk.t === 'op' && tk.v === '-') { next(); return parsePow().scale(-1n) }
    if (tk.t === 'op' && tk.v === '+') { next(); return parsePow() }
    if (tk.t === 'op' && tk.v === '(') { next(); const e = parseExpr(); if (!(peek().t === 'op' && peek().v === ')')) throw new Error('expected )'); next(); return e }
    if (tk.t === 'num') { next(); return Poly2.monomial(0, 0, tk.v) }
    if (tk.t === 'var') { next(); return tk.v === 'x' ? Poly2.monomial(1, 0, 1n) : Poly2.monomial(0, 1, 1n) }
    throw new Error(`unexpected token: '${tk.v ?? tk.t}'`)
  }

  const result = parseExpr()
  if (peek().t !== 'eof') throw new Error('unexpected token after expression')
  return result
}

// ── 6. Homogenization ───────────────────────────────────────────────────────────

export function homogenize(poly2) {
  const d = poly2.degree()
  const out = new Poly3()
  for (const [k, coeff] of poly2.terms) {
    const [ix, iy] = parseKey2(k)
    out.addTerm(ix, iy, d - ix - iy, coeff)
  }
  return out
}

// ── 8. Poly3 transform ──────────────────────────────────────────────────────────

function linearForm3(a, b, c) {
  const p = new Poly3()
  p.addTerm(1, 0, 0, BigInt(a))
  p.addTerm(0, 1, 0, BigInt(b))
  p.addTerm(0, 0, 1, BigInt(c))
  return p
}
function powPoly3(P, n) { let out = Poly3.one(); for (let i = 0; i < n; i++) out = out.mul(P); return out }

export function transformPoly3(F, A) {
  // X = A[0]·[X',Y',Z'], Y = A[1]·…, Z = A[2]·…
  const Xl = linearForm3(A[0][0], A[0][1], A[0][2])
  const Yl = linearForm3(A[1][0], A[1][1], A[1][2])
  const Zl = linearForm3(A[2][0], A[2][1], A[2][2])
  let out = new Poly3()
  for (const [k, coeff] of F.terms) {
    const [ix, iy, iz] = parseKey3(k)
    let term = Poly3.one().scale(coeff)
    term = term.mul(powPoly3(Xl, ix)).mul(powPoly3(Yl, iy)).mul(powPoly3(Zl, iz))
    out = out.add(term)
  }
  return out
}

// ── 9. Dehomogenization (Z' = 1) ─────────────────────────────────────────────────

export function dehomogenizeZ(poly3) {
  const out = new Poly2()
  for (const [k, coeff] of poly3.terms) {
    const [ix, iy] = parseKey3(k)
    out.addTerm(ix, iy, coeff)
  }
  return out
}

// ── 10. Resultant R(x) = Res_y(f, g) ─────────────────────────────────────────────

// a[j] = UniPoly in x = coefficient of y^j  (ascending)
function coeffsInY(poly2) {
  const dy = poly2.degreeY()
  const arr = []
  for (let j = 0; j <= dy; j++) arr.push([])
  for (const [k, c] of poly2.terms) {
    const [ix, iy] = parseKey2(k)
    while (arr[iy].length <= ix) arr[iy].push(0n)
    arr[iy][ix] += c
  }
  for (let j = 0; j <= dy; j++) { if (arr[j].length === 0) arr[j] = [0n]; arr[j] = uniTrim(arr[j]) }
  return arr
}

// Sylvester matrix of f, g in y; entries are UniPoly<BigInt>. Returns null if degenerate.
function sylvesterMatrixY(f, g) {
  const fc = coeffsInY(f)  // ascending, length m+1
  const gc = coeffsInY(g)
  const m = fc.length - 1
  const n = gc.length - 1
  if (m < 1 || n < 1) return null
  const fDesc = [...fc].reverse()  // [a_m, ..., a_0]
  const gDesc = [...gc].reverse()
  const size = m + n
  const M = []
  for (let i = 0; i < size; i++) { const row = []; for (let j = 0; j < size; j++) row.push(uniZero()); M.push(row) }
  for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) M[i][i + j] = fDesc[j]
  for (let i = 0; i < m; i++) for (let j = 0; j <= n; j++) M[n + i][i + j] = gDesc[j]
  return M
}

export function detPolyMatrix(M) {
  const n = M.length
  if (n === 0) return [1n]
  if (n === 1) return M[0][0]
  // permutation expansion via Heap's algorithm (n ≤ 6 → at most 720 terms)
  let result = uniZero()
  const a = Array.from({ length: n }, (_, i) => i)
  const c = new Array(n).fill(0)
  const accumulate = (perm, sgn) => {
    let term = [sgn > 0 ? 1n : -1n]
    for (let i = 0; i < n; i++) {
      const e = M[i][perm[i]]
      if (e.length === 1 && e[0] === 0n) return  // zero entry kills the term
      term = uniMul(term, e)
    }
    result = uniAdd(result, term)
  }
  let sign = 1
  accumulate(a, sign)
  let i = 0
  while (i < n) {
    if (c[i] < i) {
      const swap = i % 2 === 0 ? 0 : c[i]
      ;[a[swap], a[i]] = [a[i], a[swap]]
      sign = -sign
      accumulate(a, sign)
      c[i] += 1
      i = 0
    } else { c[i] = 0; i += 1 }
  }
  return uniTrim(result)
}

export function resultantY(f, g) {
  const M = sylvesterMatrixY(f, g)
  if (M === null) return null
  return uniTrim(detPolyMatrix(M))
}

// ── 11. Square-free decomposition over Q ─────────────────────────────────────────

export function squareFreeDecompositionInt(Rint) {
  const Rt = uniTrim(Rint)
  if (Rt.length === 1 && Rt[0] === 0n) return []
  let f = uniQMakeMonic(uniToQ(Rt))
  if (uniQDegree(f) <= 0) return []

  let b = uniQGcd(f, uniQDerivative(f))
  let c = uniQDivExact(f, b)
  let i = 1
  const result = []
  while (uniQDegree(c) > 0) {
    const y = uniQGcd(b, c)
    const z = uniQDivExact(c, y)
    if (uniQDegree(z) > 0) result.push({ factor: z, multiplicity: i })
    c = y
    b = uniQDivExact(b, y)
    i += 1
  }
  return result
}

// ── 12. Numerical roots (Durand-Kerner) ──────────────────────────────────────────

const ROOT_MAX_ITER = 400
const ROOT_TOL = 1e-12

function evalComplexAscending(coeffs, z) {
  let r = new Complex(0, 0)
  for (let i = coeffs.length - 1; i >= 0; i--) r = cAdd(cMul(r, z), coeffs[i])
  return r
}

export function durandKerner(coeffsComplex) {
  let c = coeffsComplex.slice()
  while (c.length > 1 && cAbs(c[c.length - 1]) < 1e-14) c.pop()
  const n = c.length - 1
  if (n <= 0) return []
  if (n === 1) return [cDiv(cNeg(c[0]), c[1])]
  const lead = c[n]
  const a = c.map(z => cDiv(z, lead))  // monic ascending
  let R = 0
  for (let i = 0; i < n; i++) R = Math.max(R, cAbs(a[i]))
  R = 1 + R
  const roots = []
  for (let k = 0; k < n; k++) { const th = 2 * Math.PI * k / n + 0.4; roots.push(new Complex(R * Math.cos(th), R * Math.sin(th))) }
  for (let iter = 0; iter < ROOT_MAX_ITER; iter++) {
    let maxStep = 0
    for (let k = 0; k < n; k++) {
      const p = evalComplexAscending(a, roots[k])
      let denom = new Complex(1, 0)
      for (let j = 0; j < n; j++) if (j !== k) denom = cMul(denom, cSub(roots[k], roots[j]))
      if (cAbs(denom) < 1e-300) continue
      const delta = cDiv(p, denom)
      roots[k] = cSub(roots[k], delta)
      maxStep = Math.max(maxStep, cAbs(delta))
    }
    if (maxStep < ROOT_TOL) break
  }
  return roots
}

export function complexRootsOfSquareFreeFactor(factorQ) {
  const coeffs = factorQ.map(q => new Complex(qToNumber(q), 0))
  return durandKerner(coeffs)
}

// ── 13. Back-substitution ────────────────────────────────────────────────────────

const RESIDUAL_EPS = 1e-6
const DEDUP_EPS = 1e-6

function substituteXToGetPolyY(poly2, xC) {
  const dy = poly2.degreeY()
  const coeffs = []
  for (let j = 0; j <= dy; j++) coeffs.push(new Complex(0, 0))
  for (const [k, c] of poly2.terms) {
    const [ix, iy] = parseKey2(k)
    coeffs[iy] = cAdd(coeffs[iy], cMul(new Complex(Number(c), 0), cPow(xC, ix)))
  }
  return coeffs  // ascending in y
}

function complexDegree(coeffs) {
  let d = coeffs.length - 1
  while (d > 0 && cAbs(coeffs[d]) < 1e-12) d--
  if (d === 0 && cAbs(coeffs[0]) < 1e-12) return -1
  return d
}

export function solveYForX(f, g, xRoot) {
  const pf = substituteXToGetPolyY(f, xRoot)
  const pg = substituteXToGetPolyY(g, xRoot)
  const df = complexDegree(pf)
  const dg = complexDegree(pg)
  // choose the polynomial that genuinely constrains y (higher degree, stable leading)
  let chosen = null
  if (df >= 1 && dg >= 1) chosen = df >= dg ? pf : pg
  else if (df >= 1) chosen = pf
  else if (dg >= 1) chosen = pg
  else return []  // both independent of y at this x → cannot resolve

  const yCands = durandKerner(chosen)
  const accepted = []
  for (const y of yCands) {
    const rf = cAbs(f.evaluateComplex(xRoot, y))
    const rg = cAbs(g.evaluateComplex(xRoot, y))
    if (rf < RESIDUAL_EPS && rg < RESIDUAL_EPS) accepted.push(y)
  }
  // dedup close y roots
  const dedup = []
  for (const y of accepted) {
    if (!dedup.some(z => cAbs(cSub(z, y)) < DEDUP_EPS)) dedup.push(y)
  }
  return dedup
}

// ── 14-15. Projective points ─────────────────────────────────────────────────────

export function applyMatrixToProjective(A, p) {
  const [x, y, z] = p
  const comb = (r) => cAdd(cAdd(cScale(x, r[0]), cScale(y, r[1])), cScale(z, r[2]))
  return [comb(A[0]), comb(A[1]), comb(A[2])]
}

export function normalizeProjectivePoint(P) {
  const mags = P.map(cAbs)
  let idx = 0
  if (mags[1] > mags[idx]) idx = 1
  if (mags[2] > mags[idx]) idx = 2
  const d = P[idx]
  return P.map(c => cDiv(c, d))
}

function vecNorm(P) { return Math.sqrt(P.reduce((s, c) => s + c.re * c.re + c.im * c.im, 0)) }

export function projectiveDistance(P, Q) {
  const cross = [
    cSub(cMul(P[1], Q[2]), cMul(P[2], Q[1])),
    cSub(cMul(P[2], Q[0]), cMul(P[0], Q[2])),
    cSub(cMul(P[0], Q[1]), cMul(P[1], Q[0])),
  ]
  const denom = vecNorm(P) * vecNorm(Q)
  if (denom < 1e-300) return Infinity
  return vecNorm(cross) / denom
}

const INFINITY_EPS = 1e-7
const REAL_EPS = 1e-7

export function classifyProjectivePoint(P) {
  const [X, Y, Z] = normalizeProjectivePoint(P)
  const isInfinity = cAbs(Z) < INFINITY_EPS
  const isReal = Math.abs(X.im) < REAL_EPS && Math.abs(Y.im) < REAL_EPS && Math.abs(Z.im) < REAL_EPS
  if (!isInfinity && isReal) return 'real_affine'
  if (!isInfinity && !isReal) return 'complex_affine'
  if (isInfinity && isReal) return 'real_infinity'
  return 'complex_infinity'
}

// ── 7. Transform candidates ─────────────────────────────────────────────────────

const TRANSFORM_CANDIDATES = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],

  [[1, 0, 1], [0, 1, 0], [0, 0, 1]],
  [[1, 0, 0], [0, 1, 1], [0, 0, 1]],
  [[1, 1, 0], [0, 1, 0], [0, 0, 1]],
  [[1, 0, 0], [1, 1, 0], [0, 0, 1]],

  [[1, 0, 0], [0, 1, 0], [0, 1, 1]],
  [[1, 0, 0], [0, 1, 0], [1, 0, 1]],

  [[1, 0, 1], [0, 1, 1], [0, 0, 1]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 1]],

  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],

  [[1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 0], [0, 1, 1]],
  [[1, 0, 0], [0, 1, 0], [1, 1, 1]],
  [[1, 2, 0], [0, 1, 0], [1, 0, 1]],
  [[1, 0, 1], [0, 1, 2], [1, 0, 1]],
]

function identity3() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }
export function det3(A) {
  return (
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
  )
}
export function isUnimodular(A) { return Math.abs(det3(A)) === 1 }

function makeRng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function randomSmallUnimodularMatrix(rng) {
  const A = identity3()
  const steps = 5 + Math.floor(rng() * 8)
  for (let st = 0; st < steps; st++) {
    const op = Math.floor(rng() * 3)
    if (op === 0) { // swap two rows
      const i = Math.floor(rng() * 3); let j = Math.floor(rng() * 3); if (j === i) j = (j + 1) % 3
      ;[A[i], A[j]] = [A[j], A[i]]
    } else if (op === 1) { // negate a row
      const i = Math.floor(rng() * 3); A[i] = A[i].map(v => -v)
    } else { // row_i += k row_j
      const i = Math.floor(rng() * 3); let j = Math.floor(rng() * 3); if (j === i) j = (j + 1) % 3
      const k = [-2, -1, 1, 2][Math.floor(rng() * 4)]
      A[i] = A[i].map((v, c) => v + k * A[j][c])
    }
  }
  return A
}

const MAX_TRANSFORM_TRIES = 30
function buildTransformList(options) {
  const list = TRANSFORM_CANDIDATES.map(A => A.map(r => r.slice()))
  const rng = makeRng(options.seed ?? 12345)
  while (list.length < MAX_TRANSFORM_TRIES) {
    const A = randomSmallUnimodularMatrix(rng)
    if (isUnimodular(A)) list.push(A)
  }
  return list
}

// ── 16-17. Transform attempt ─────────────────────────────────────────────────────

const ACCEPT_RESIDUAL = 1e-4

function tryTransformSolve(F, G, A, expected) {
  const report = {
    transform: A, status: 'failed', resultantDegree: -1,
    expectedDegree: expected, totalMultiplicity: 0, message: '',
  }

  const fA = dehomogenizeZ(transformPoly3(F, A))
  const gA = dehomogenizeZ(transformPoly3(G, A))

  const R = resultantY(fA, gA)
  if (R === null) {
    report.status = 'bad_resultant_degree'
    report.message = 'one polynomial is independent of y in this chart'
    return { status: 'failed', report }
  }
  if (R.length === 1 && R[0] === 0n) {
    report.status = 'zero_resultant'
    report.message = 'resultant ≡ 0 (common component or degenerate projection)'
    return { status: 'zero_resultant', report }
  }

  const degR = uniDegree(R)
  report.resultantDegree = degR
  if (degR !== expected) {
    report.status = 'bad_resultant_degree'
    report.message = `resultant degree ${degR} ≠ expected ${expected}`
    return { status: 'failed', report }
  }

  const sfd = squareFreeDecompositionInt(R)
  let mult = 0
  for (const { factor, multiplicity } of sfd) mult += uniQDegree(factor) * multiplicity
  report.totalMultiplicity = mult
  if (mult !== expected) {
    report.status = 'multiplicity_mismatch'
    report.message = `square-free multiplicity sum ${mult} ≠ expected ${expected}`
    return { status: 'failed', report }
  }

  const points = []
  for (const { factor, multiplicity } of sfd) {
    const xRoots = complexRootsOfSquareFreeFactor(factor)
    for (const xRoot of xRoots) {
      const ys = solveYForX(fA, gA, xRoot)
      if (ys.length !== 1) {
        report.status = 'fiber_collision'
        report.message = `x-root maps to ${ys.length} y-roots (projection not generic)`
        return { status: 'failed', report }
      }
      const yRoot = ys[0]
      const transformedProjective = [xRoot, yRoot, new Complex(1, 0)]
      const originalProjective = normalizeProjectivePoint(applyMatrixToProjective(A, transformedProjective))
      const residualF = cAbs(fA.evaluateComplex(xRoot, yRoot))
      const residualG = cAbs(gA.evaluateComplex(xRoot, yRoot))
      if (residualF > ACCEPT_RESIDUAL || residualG > ACCEPT_RESIDUAL) {
        report.status = 'residual_too_large'
        report.message = `residual F=${residualF.toExponential(2)}, G=${residualG.toExponential(2)}`
        return { status: 'failed', report }
      }
      points.push({
        originalProjective,
        transformedProjective: normalizeProjectivePoint(transformedProjective),
        affineInTransformedChart: [xRoot, yRoot],
        multiplicity,
        type: classifyProjectivePoint(originalProjective),
        residualF, residualG,
      })
    }
  }

  // projective dedup (safety): merge identical points, summing multiplicity
  const merged = []
  for (const pt of points) {
    const hit = merged.find(m => projectiveDistance(m.originalProjective, pt.originalProjective) < 1e-6)
    if (hit) hit.multiplicity += pt.multiplicity
    else merged.push(pt)
  }

  const total = merged.reduce((s, p) => s + p.multiplicity, 0)
  if (total !== expected) {
    report.status = 'multiplicity_mismatch'
    report.message = `point multiplicity sum ${total} ≠ expected ${expected}`
    return { status: 'failed', report }
  }

  report.status = 'accepted'
  report.message = 'accepted'
  report.totalMultiplicity = total
  return { status: 'ok', report, points: merged, totalMultiplicity: total }
}

// ── 19. Solver main loop ─────────────────────────────────────────────────────────

function baseResult(extra) {
  return {
    status: 'failed',
    method: 'integer_projective_transform_resultant',
    degreeF: 0, degreeG: 0,
    expectedBezoutCount: 0, totalMultiplicity: 0,
    transform: null, points: [], attempts: [],
    warnings: [], errors: [],
    ...extra,
  }
}

export function solveBezoutSystem(inputF, inputG, options = {}) {
  const attempts = []
  let f, g
  try {
    f = typeof inputF === 'string' ? parsePolynomial2(inputF) : inputF
    g = typeof inputG === 'string' ? parsePolynomial2(inputG) : inputG
  } catch (err) {
    return baseResult({ status: 'parse_error', errors: [String(err.message ?? err)] })
  }

  if (f.isZero() || g.isZero()) {
    return baseResult({ status: 'parse_error', errors: ['f and g must be nonzero polynomials'] })
  }

  const F = homogenize(f)
  const G = homogenize(g)
  const degreeF = F.degree()
  const degreeG = G.degree()
  const expected = degreeF * degreeG

  const transforms = buildTransformList(options)
  let zeroResultantCount = 0

  for (const A of transforms) {
    const attempt = tryTransformSolve(F, G, A, expected)
    attempts.push(attempt.report)

    if (attempt.status === 'zero_resultant') {
      zeroResultantCount += 1
      if (zeroResultantCount >= 3) {
        return baseResult({
          status: 'common_component_suspected',
          degreeF, degreeG, expectedBezoutCount: expected,
          attempts,
          warnings: ['resultant vanished for several independent projections; finite point counting disabled'],
        })
      }
      continue
    }

    if (attempt.status === 'ok') {
      return baseResult({
        status: 'ok',
        degreeF, degreeG,
        expectedBezoutCount: expected,
        totalMultiplicity: attempt.totalMultiplicity,
        transform: A,
        points: attempt.points,
        attempts,
      })
    }
  }

  return baseResult({
    status: 'failed',
    degreeF, degreeG, expectedBezoutCount: expected,
    attempts,
    errors: ['No acceptable integer projective transform found.'],
  })
}
