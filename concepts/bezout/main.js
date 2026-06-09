// main.js — Bézout visualizer UI + canvas rendering.
// The intersection / multiplicity computation lives in the separate algebraic
// engine bezout_solver.js (exact resultant + square-free decomposition); this
// file only parses for the curve rendering, calls the solver, and draws.

import { solveBezoutSystem } from './bezout_solver.js'

// ── 1. Constants & tolerances (rendering-side only) ───────────────────────────

const REAL_TOL = 1e-6   // imaginary-part threshold for display formatting

// ── 2. Complex arithmetic ──────────────────────────────────────────────────────

function C(re, im = 0) { return { re, im } }
function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
function cAbs(a) { return Math.hypot(a.re, a.im) }

// ── 3. Bivariate polynomial utilities (parsing + marching squares) ────────────
// BiPoly = Map<"i,j", bigint>  (key = "i,j" means x^i y^j)

function biKey(i, j) { return `${i},${j}` }
function biParsKey(k) { const [i, j] = k.split(',').map(Number); return [i, j] }

function degreeTotal(p) {
  let d = 0
  for (const k of p.keys()) { const [i, j] = biParsKey(k); d = Math.max(d, i + j) }
  return d
}

function coeffAbsMax(p) {
  let m = 0n
  for (const v of p.values()) { const a = v < 0n ? -v : v; if (a > m) m = a }
  return m
}

// ── 4. Parser ──────────────────────────────────────────────────────────────────

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue }
    if (/\d/.test(src[i])) {
      let n = ''
      while (i < src.length && /\d/.test(src[i])) n += src[i++]
      tokens.push({ type: 'num', value: BigInt(n) })
    } else if (src[i] === 'x') { tokens.push({ type: 'var', name: 'x' }); i++ }
    else if (src[i] === 'y') { tokens.push({ type: 'var', name: 'y' }); i++ }
    else if ('+-*/^()'.includes(src[i])) { tokens.push({ type: 'op', value: src[i] }); i++ }
    else throw new Error(`Unexpected character: '${src[i]}'`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

function parse(src) {
  const tokens = tokenize(src)
  let pos = 0
  function peek() { return tokens[pos] }
  function consume() { return tokens[pos++] }
  function expect(type, val) {
    const t = consume()
    if (t.type !== type || (val !== undefined && t.value !== val))
      throw new Error(`Expected ${val ?? type}, got ${t.value ?? t.type}`)
    return t
  }

  function parseExpr() {
    let left = parseTerm()
    while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value
      const right = parseTerm()
      left = { kind: op === '+' ? 'add' : 'sub', left, right }
    }
    return left
  }

  function parseTerm() {
    let left = parsePow()
    while (peek().type === 'op' && peek().value === '*') {
      consume()
      const right = parsePow()
      left = { kind: 'mul', left, right }
    }
    return left
  }

  function parsePow() {
    let base = parseAtom()
    if (peek().type === 'op' && peek().value === '^') {
      consume()
      const expTok = consume()
      if (expTok.type !== 'num') throw new Error('Exponent must be a non-negative integer')
      const exp = Number(expTok.value)
      if (exp < 0 || !Number.isInteger(exp)) throw new Error('Exponent must be a non-negative integer')
      base = { kind: 'pow', base, exponent: exp }
    }
    return base
  }

  function parseAtom() {
    const t = peek()
    if (t.type === 'op' && t.value === '-') { consume(); return { kind: 'neg', expr: parsePow() } }
    if (t.type === 'op' && t.value === '(') {
      consume()
      const e = parseExpr()
      expect('op', ')')
      return e
    }
    if (t.type === 'num') { consume(); return { kind: 'const', value: t.value } }
    if (t.type === 'var') { consume(); return { kind: 'var', name: t.name } }
    throw new Error(`Unexpected token: '${t.value ?? t.type}'`)
  }

  const ast = parseExpr()
  if (peek().type !== 'eof') throw new Error('Unexpected token after expression')
  return ast
}

function astToBiPoly(node) {
  switch (node.kind) {
    case 'const': {
      const m = new Map(); if (node.value !== 0n) m.set('0,0', node.value); return m
    }
    case 'var': {
      const m = new Map(); m.set(node.name === 'x' ? '1,0' : '0,1', 1n); return m
    }
    case 'neg': {
      const p = astToBiPoly(node.expr)
      const r = new Map()
      for (const [k, v] of p) r.set(k, -v)
      return r
    }
    case 'add': case 'sub': {
      const a = astToBiPoly(node.left), b = astToBiPoly(node.right)
      const r = new Map(a)
      for (const [k, v] of b) {
        const cur = r.get(k) ?? 0n
        const nv = node.kind === 'add' ? cur + v : cur - v
        if (nv !== 0n) r.set(k, nv); else r.delete(k)
      }
      return r
    }
    case 'mul': {
      const a = astToBiPoly(node.left), b = astToBiPoly(node.right)
      const r = new Map()
      for (const [ka, va] of a) {
        const [ia, ja] = biParsKey(ka)
        for (const [kb, vb] of b) {
          const [ib, jb] = biParsKey(kb)
          const nk = biKey(ia + ib, ja + jb)
          const cur = r.get(nk) ?? 0n
          const nv = cur + va * vb
          if (nv !== 0n) r.set(nk, nv); else r.delete(nk)
        }
      }
      return r
    }
    case 'pow': {
      if (node.exponent === 0) return new Map([['0,0', 1n]])
      let r = astToBiPoly(node.base)
      for (let i = 1; i < node.exponent; i++) r = astToBiPoly({ kind: 'mul', left: node.base, right: { kind: '_poly', _poly: r } })
      return r
    }
    case '_poly': return node._poly
    default: throw new Error(`Unknown AST node: ${node.kind}`)
  }
}

function parseBiPoly(src) {
  const ast = parse(src.trim())
  return astToBiPoly(ast)
}

// ── 6. Input validation ───────────────────────────────────────────────────────

function validateInput(f, g) {
  const errs = []
  if (f.size === 0) errs.push('f is the zero polynomial')
  if (g.size === 0) errs.push('g is the zero polynomial')
  if (degreeTotal(f) === 0) errs.push('f is a nonzero constant — no curve')
  if (degreeTotal(g) === 0) errs.push('g is a nonzero constant — no curve')
  if (degreeTotal(f) > 3) errs.push(`deg(f) = ${degreeTotal(f)} > 3`)
  if (degreeTotal(g) > 3) errs.push(`deg(g) = ${degreeTotal(g)} > 3`)
  if (coeffAbsMax(f) > 20n) errs.push('f has a coefficient with |c| > 20')
  if (coeffAbsMax(g) > 20n) errs.push('g has a coefficient with |c| > 20')
  return errs
}

// ── 6. Projective-direction helper (used by the infinity-circle rendering) ────

function normalizeInfPt({ X, Y }) {
  if (cAbs(X) >= cAbs(Y)) {
    if (cAbs(X) < 1e-300) return { X: C(1), Y: C(0) }
    return { X: C(1), Y: cDiv(Y, X) }
  } else {
    if (cAbs(Y) < 1e-300) return { X: C(0), Y: C(1) }
    return { X: cDiv(X, Y), Y: C(1) }
  }
}

// ── 13. Canvas rendering ──────────────────────────────────────────────────────

const canvas = document.getElementById('canvas')
const tooltip = document.getElementById('bezout-tooltip')

function prep() {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.parentElement.getBoundingClientRect()
  const W = Math.floor(rect.width)
  const H = Math.floor(rect.height)
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  return [ctx, W, H]
}

// ── Radial compression ρ(r) ───────────────────────────────────────────────────
// Squeezes all of R² into a disk of radius RHO_DISK so the line at infinity is a
// finite circle, using the exact Poincaré-disk map in closed form:
//   ρ(r) = R · tanh(r / R)
// Near the origin tanh(x) ≈ x, so this is automatically ≈ the identity (no separate
// "normal range" or transition zone needed); as r → ∞, tanh → 1, so ρ → R. Its inverse
//   affineRadius(u) = R · artanh(u / R) = (R/2)·ln((R+u)/(R−u))
// is exactly the Poincaré geodesic distance from the centre, and the induced radial
// scale dr/du = R²/(R²−u²) is the (first-power) Poincaré conformal factor — so far-away
// regions crowd the rim exponentially, as in the Poincaré disk.

const RHO_DISK = 5

function displayRadius(r) { return RHO_DISK * Math.tanh(r / RHO_DISK) }       // plane → disk
function affineRadius(u) {                                                    // disk → plane
  const t = Math.min(Math.max(u / RHO_DISK, 0), 1 - 1e-12)                    // guard the rim
  return RHO_DISK * Math.atanh(t)
}
// affine plane point → compressed disk coordinate (plane units, |·| < RHO_DISK)
function planeToDisk(ax, ay) {
  const r = Math.hypot(ax, ay)
  if (r < 1e-12) return [0, 0]
  const g = displayRadius(r)
  return [g * ax / r, g * ay / r]
}

// Reference circles at (mostly) equal affine spacing: in the display they crowd
// toward the rim, which is exactly what makes the Poincaré magnification visible.
// Stop just short of the boundary so the densest rings stay distinguishable.
const REF_CIRCLES = (() => {
  const out = []
  for (let r = 0.5; r <= 4; r += 0.5) out.push(r)
  for (let r = 5; r <= 100; r += 1) { if (RHO_DISK - displayRadius(r) < 0.03) break; out.push(r) }
  return out
})()

// ── 3D camera (orthographic orbit) ────────────────────────────────────────────
// The disk lives in the world z=0 plane; complex points float along z. el = π/2 is
// the top-down view (reset state) and reproduces a flat 2D look.

function makeCamera(cam, cx, cy, pxScale) {
  const ca = Math.cos(cam.az), sa = Math.sin(cam.az)
  const phi = Math.PI / 2 - cam.el            // tilt from top-down (0 = flat)
  const cp = Math.cos(phi), sp = Math.sin(phi)
  return (du, dv, h = 0) => {
    const X = du * pxScale, Y = dv * pxScale, Z = h * pxScale
    const x1 = X * ca - Y * sa
    const y1 = X * sa + Y * ca
    const screenV = y1 * cp + Z * sp          // height lifts up on screen when tilted
    const depth = -y1 * sp + Z * cp           // painter's-order key (larger = nearer)
    return { sx: cx + x1, sy: cy - screenV, depth }
  }
}

// ── Curve extraction in disk space (marching squares) ─────────────────────────
// Sampled uniformly in screen/disk space so resolution is even. A disk sample in
// direction t at display radius rd is the projective point on that ray
//   [cos t : sin t : μ]   with   μ = 1 / (affine radius)   (μ = 0 on the rim = ∞).
// Because the HOMOGENISED form F is homogeneous, only the direction of this vector
// matters; the first two coords are already ≤ 1, so bounding it just needs a divide by
// max(1, μ). F is then bounded and varies smoothly across the boundary Z = 0 — no
// magnitude blow-up near the rim, so the contour stays smooth and meets the boundary
// circle exactly at the curve's real points at infinity. On the affine part
// sign(F) = sign(f), so the zero set is unchanged.

const CURVE_N = 220

function sampleField(poly, deg, du, dv, R) {
  const rd = Math.hypot(du, dv)
  let X, Y, Z
  if (rd < 1e-12) { X = 0; Y = 0; Z = 1 }            // origin → [0:0:1]
  else {
    X = du / rd; Y = dv / rd                          // (cos t, sin t), already ‖·‖ = 1
    Z = rd < R ? 1 / affineRadius(rd) : 0             // μ, vanishing on the rim
    const m = Math.max(1, Z)
    X /= m; Y /= m; Z /= m
  }
  let val = 0
  for (const [k, cv] of poly) {
    const [i, j] = biParsKey(k)
    val += Number(cv) * Math.pow(X, i) * Math.pow(Y, j) * Math.pow(Z, deg - i - j)
  }
  return val
}

// keep the portion of segment P1→P2 with |·| ≤ R (clip against the disk boundary)
function clipSegmentToDisk(x1, y1, x2, y2, R) {
  const dx = x2 - x1, dy = y2 - y1
  const A = dx * dx + dy * dy
  if (A < 1e-18) return Math.hypot(x1, y1) <= R ? [x1, y1, x2, y2] : null
  const B = 2 * (x1 * dx + y1 * dy), Cc = x1 * x1 + y1 * y1 - R * R
  const disc = B * B - 4 * A * Cc
  if (disc <= 0) return null
  const sq = Math.sqrt(disc)
  const t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A))
  if (t0 > t1) return null
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy]
}

function computeCurveSegments(poly) {
  const N = CURVE_N, R = RHO_DISK, step = 2 * R / N
  const ox = step * 1.7e-3, oy = step * 1.3e-3   // anti-degeneracy nudge
  const coord = k => -R + k * step
  const deg = degreeTotal(poly)
  const grid = []
  for (let j = 0; j <= N; j++) {
    const row = []
    for (let i = 0; i <= N; i++) row.push(sampleField(poly, deg, coord(i) + ox, coord(j) + oy, R))
    grid.push(row)
  }
  const segs = []
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a0 = coord(i) + ox, a1 = a0 + step, b0 = coord(j) + oy, b1 = b0 + step
    // skip cells entirely outside the disk (their contour, if any, clips to nothing)
    if (Math.hypot(a0, b0) > R && Math.hypot(a1, b0) > R && Math.hypot(a0, b1) > R && Math.hypot(a1, b1) > R) continue
    const v00 = grid[j][i], v10 = grid[j][i + 1], v01 = grid[j + 1][i], v11 = grid[j + 1][i + 1]
    const interp = (a, b, va, vb) => a + (b - a) * (-va / (vb - va))
    const s = (v00 < 0 ? 8 : 0) | (v10 < 0 ? 4 : 0) | (v11 < 0 ? 2 : 0) | (v01 < 0 ? 1 : 0)
    const bottom = () => [interp(a0, a1, v00, v10), b0]
    const top    = () => [interp(a0, a1, v01, v11), b1]
    const left   = () => [a0, interp(b0, b1, v00, v01)]
    const right  = () => [a1, interp(b0, b1, v10, v11)]
    const add = (p, q) => { const c = clipSegmentToDisk(p[0], p[1], q[0], q[1], R); if (c) segs.push(c) }
    switch (s) {
      case 1: case 14: add(left(), top());     break
      case 2: case 13: add(top(), right());    break
      case 3: case 12: add(left(), right());   break
      case 4: case 11: add(bottom(), right()); break
      case 6: case 9:  add(bottom(), top());   break
      case 7: case 8:  add(bottom(), left());  break
      case 5:  if (v00 + v10 + v11 + v01 < 0) { add(bottom(), left()); add(top(), right()) } else { add(left(), top()); add(bottom(), right()) } break
      case 10: if (v00 + v10 + v11 + v01 < 0) { add(left(), top()); add(bottom(), right()) } else { add(bottom(), left()); add(top(), right()) } break
    }
  }
  return segs
}

// ── Point markers ─────────────────────────────────────────────────────────────

const HEIGHT_SCALE = 1.3
function markerRadius(m, base, grow) { return base + (Math.max(1, m) - 1) * grow }

// signed float height of a complex affine point (its conjugate gets the opposite sign)
function complexHeight(pt) {
  const im = Math.hypot(pt.x.im, pt.y.im)
  const s = pt.y.im !== 0 ? Math.sign(pt.y.im) : (Math.sign(pt.x.im) || 1)
  return s * Math.min(RHO_DISK * 0.75, HEIGHT_SCALE * im)
}

// Build screen-space marker descriptors (used by both rendering and hit-testing).
function enumerateMarkers(result, proj) {
  const out = []
  for (const pt of result.affinePoints) {
    if (pt.kind === 'real-affine') {
      const [du, dv] = planeToDisk(pt.x.re, pt.y.re)
      const P = proj(du, dv, 0)
      out.push({ pt, color: '#ffffff', radius: markerRadius(pt.multiplicity, 4.5, 3), mult: pt.multiplicity,
        sx: P.sx, sy: P.sy, depth: P.depth, glow: true })
    } else if (pt.kind === 'complex-affine' && state.showComplexShadows) {
      const [du, dv] = planeToDisk(pt.x.re, pt.y.re)
      const h = complexHeight(pt)
      const base = proj(du, dv, 0), top = proj(du, dv, h)
      out.push({ pt, color: '#ff88cc', radius: markerRadius(pt.multiplicity, 4.5, 3), mult: pt.multiplicity,
        sx: top.sx, sy: top.sy, depth: top.depth, baseSx: base.sx, baseSy: base.sy, connector: true })
    }
  }
  if (state.showInfinityPoints) {
    for (const pt of result.infinityPoints) {
      const norm = normalizeInfPt(pt)
      let theta, imag = 0
      if (pt.kind === 'real-infinity') {
        theta = Math.atan2(norm.Y.re, norm.X.re)
      } else if (cAbs(norm.X) >= cAbs(norm.Y)) {
        theta = Math.atan2(cDiv(norm.Y, norm.X).re, 1); imag = Math.hypot(norm.X.im, norm.Y.im)
      } else {
        theta = Math.atan2(1, cDiv(norm.X, norm.Y).re); imag = Math.hypot(norm.X.im, norm.Y.im)
      }
      const color = pt.kind === 'real-infinity' ? '#44e2cd' : '#ffafd3'
      const rad = markerRadius(pt.multiplicity, 4, 2.4)
      if (pt.kind === 'real-infinity') {
        for (const t of [theta, theta + Math.PI]) {
          const P = proj(RHO_DISK * Math.cos(t), RHO_DISK * Math.sin(t), 0)
          out.push({ pt, color, radius: rad, mult: pt.multiplicity, sx: P.sx, sy: P.sy, depth: P.depth })
        }
      } else {
        const h = Math.min(RHO_DISK * 0.75, HEIGHT_SCALE * imag)
        for (const [t, hh] of [[theta, h], [theta + Math.PI, -h]]) {
          const bx = RHO_DISK * Math.cos(t), by = RHO_DISK * Math.sin(t)
          const base = proj(bx, by, 0), top = proj(bx, by, hh)
          out.push({ pt, color, radius: rad, mult: pt.multiplicity, sx: top.sx, sy: top.sy, depth: top.depth,
            baseSx: base.sx, baseSy: base.sy, connector: true, faint: true })
        }
      }
    }
  }
  return out
}

function drawMarker(ctx, m) {
  if (m.baseSx !== undefined) {
    ctx.save()
    ctx.globalAlpha = m.faint ? 0.3 : 0.55
    ctx.strokeStyle = m.color; ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath(); ctx.moveTo(m.baseSx, m.baseSy); ctx.lineTo(m.sx, m.sy); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 0.3; ctx.fillStyle = m.color
    ctx.beginPath(); ctx.arc(m.baseSx, m.baseSy, 3, 0, 2 * Math.PI); ctx.fill()
    ctx.restore()
  }
  if (m.glow) {
    const g = ctx.createRadialGradient(m.sx, m.sy, 0, m.sx, m.sy, m.radius + 5)
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath(); ctx.arc(m.sx, m.sy, m.radius + 5, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill()
  }
  ctx.save()
  ctx.globalAlpha = m.faint ? 0.65 : 1
  ctx.beginPath(); ctx.arc(m.sx, m.sy, m.radius, 0, 2 * Math.PI)
  ctx.fillStyle = m.color; ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke()
  if (m.mult >= 2) {  // outer ring emphasises higher multiplicity
    ctx.globalAlpha = m.faint ? 0.4 : 0.8
    ctx.beginPath(); ctx.arc(m.sx, m.sy, m.radius + 3, 0, 2 * Math.PI)
    ctx.strokeStyle = m.color; ctx.lineWidth = 1; ctx.stroke()
  }
  ctx.restore()
}

// ── render ────────────────────────────────────────────────────────────────────

function render() {
  const [ctx, W, H] = prep()
  const cx = W / 2, cy = H / 2
  const radiusPx = Math.min(W, H) * 0.44
  const pxScale = radiusPx / RHO_DISK
  const proj = makeCamera(state.cam, cx, cy, pxScale)
  ctx.clearRect(0, 0, W, H)

  // floor: subtle disk fill + reference circles (bunching near the rim shows the
  // exponential compression) + radial spokes.
  const ring = (rd, stroke, lw = 1, dash = null) => {
    ctx.save(); ctx.strokeStyle = stroke; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash)
    ctx.beginPath()
    for (let i = 0; i <= 96; i++) { const t = 2 * Math.PI * i / 96; const P = proj(rd * Math.cos(t), rd * Math.sin(t), 0); i ? ctx.lineTo(P.sx, P.sy) : ctx.moveTo(P.sx, P.sy) }
    ctx.closePath(); ctx.stroke(); ctx.restore()
  }
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i <= 96; i++) { const t = 2 * Math.PI * i / 96; const P = proj(RHO_DISK * Math.cos(t), RHO_DISK * Math.sin(t), 0); i ? ctx.lineTo(P.sx, P.sy) : ctx.moveTo(P.sx, P.sy) }
  ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fill()
  ctx.restore()
  // reference circles (equal affine spacing → crowd at rim); r=3 = ≈-identity edge
  for (const rr of REF_CIRCLES) {
    ring(displayRadius(rr), rr === 3 ? 'rgba(181,196,255,0.30)' : 'rgba(255,255,255,0.06)')
  }
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
  for (let k = 0; k < 16; k++) {
    const t = 2 * Math.PI * k / 16
    const A = proj(0, 0, 0), B = proj(RHO_DISK * Math.cos(t), RHO_DISK * Math.sin(t), 0)
    ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke()
  }
  ctx.restore()

  // line at infinity = disk boundary
  ring(RHO_DISK, 'rgba(255,255,255,0.30)', 1.2, [4, 6])
  const topLabel = proj(0, RHO_DISK, 0)
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.font = '9px JetBrains Mono, monospace'
  ctx.textAlign = 'center'; ctx.fillText('RP¹ (line at ∞)', topLabel.sx, topLabel.sy - 6); ctx.restore()

  const result = state.result
  if (!result || !result.valid) {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '13px Inter, sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('Enter polynomials and press Compute', cx, cy); ctx.restore()
    return
  }

  // curves (cached disk-space segments, just re-projected)
  drawSegments(ctx, proj, result.segF, 'rgba(100, 180, 255, 0.85)')
  drawSegments(ctx, proj, result.segG, 'rgba(255, 175, 100, 0.85)')

  // points: depth-sorted so floating markers layer correctly under rotation
  const markers = enumerateMarkers(result, proj)
  markers.sort((a, b) => a.depth - b.depth)
  for (const m of markers) drawMarker(ctx, m)
}

function drawSegments(ctx, proj, segs, color) {
  if (!segs) return
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath()
  for (const [a, b, c, d] of segs) {
    const P = proj(a, b, 0), Q = proj(c, d, 0)
    ctx.moveTo(P.sx, P.sy); ctx.lineTo(Q.sx, Q.sy)
  }
  ctx.stroke(); ctx.restore()
}

// ── 14. Tooltip hit-testing ────────────────────────────────────────────────────

function findNearestPoint(mouseX, mouseY, W, H) {
  if (!state.result || !state.result.valid) return null
  const cx = W / 2, cy = H / 2
  const radiusPx = Math.min(W, H) * 0.44
  const pxScale = radiusPx / RHO_DISK
  const proj = makeCamera(state.cam, cx, cy, pxScale)
  const HIT_R = 14

  let best = null, bestDist = HIT_R
  for (const m of enumerateMarkers(state.result, proj)) {
    const d = Math.hypot(mouseX - m.sx, mouseY - m.sy)
    if (d < bestDist) { bestDist = d; best = m.pt }
  }
  return best
}

function fmtComplex(z, digits = 4) {
  if (Math.abs(z.im) < REAL_TOL) return z.re.toFixed(digits)
  const sign = z.im >= 0 ? '+' : '−'
  return `${z.re.toFixed(3)} ${sign} ${Math.abs(z.im).toFixed(3)}i`
}

function buildTooltipHTML(pt) {
  if (!pt) return ''
  let html = ''
  if (pt.kind === 'real-affine') {
    html += `<div class="tt-type" style="color:#fff">Real Affine</div>`
    html += `<div class="tt-coord">x ≈ ${fmtComplex(pt.x)}</div>`
    html += `<div class="tt-coord">y ≈ ${fmtComplex(pt.y)}</div>`
  } else if (pt.kind === 'complex-affine') {
    html += `<div class="tt-type" style="color:#ff88cc">Complex Affine</div>`
    html += `<div class="tt-coord">x ≈ ${fmtComplex(pt.x)}</div>`
    html += `<div class="tt-coord">y ≈ ${fmtComplex(pt.y)}</div>`
    html += `<div class="tt-coord" style="opacity:0.6">shadow ≈ (${pt.x.re.toFixed(3)}, ${pt.y.re.toFixed(3)})</div>`
    html += `<div class="tt-warn">Complex intersection. Shadow = real-part projection.</div>`
  } else if (pt.kind === 'real-infinity') {
    const n = normalizeInfPt(pt)
    html += `<div class="tt-type" style="color:#44e2cd">Real Infinity</div>`
    html += `<div class="tt-coord">[${fmtComplex(n.X, 3)} : ${fmtComplex(n.Y, 3)} : 0]</div>`
    html += `<div class="tt-warn">Antipodal pair = one projective point.</div>`
  } else if (pt.kind === 'complex-infinity') {
    const n = normalizeInfPt(pt)
    html += `<div class="tt-type" style="color:#ffafd3">Complex Infinity</div>`
    html += `<div class="tt-coord">[${fmtComplex(n.X, 3)} : ${fmtComplex(n.Y, 3)} : 0]</div>`
    html += `<div class="tt-warn">Non-real point at infinity. Position shown is a chart-dependent real shadow.</div>`
  }
  if (typeof pt.multiplicity === 'number') {
    html += `<div class="tt-coord" style="margin-top:4px">multiplicity: <b>${pt.multiplicity}</b></div>`
  }
  if (typeof pt.residual === 'number') {
    html += `<div class="tt-coord" style="opacity:0.6">residual ≈ ${pt.residual.toExponential(1)}</div>`
  }
  if (pt.warnings && pt.warnings.length) {
    for (const w of pt.warnings) html += `<div class="tt-warn">⚠ ${w}</div>`
  }
  return html
}

// ── 15. Built-in examples ─────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'line ∩ circle', f: 'x^2 + y^2 - 1', g: '2*y - 1' },
  { label: 'concentric', f: 'x^2 + y^2 - 1', g: 'x^2 + y^2 - 4' },
  { label: 'parabola', f: 'y - x^2', g: 'y + 1' },
  { label: 'tangency', f: 'y', g: 'y - x^2' },
  { label: 'fin+inf', f: 'y - x^2', g: 'y + x^2' },
  { label: 'two lines', f: 'x + y', g: 'x - y' },
  { label: 'parallel', f: 'y', g: 'y - 1' },
  { label: 'vert/horiz', f: 'x', g: 'y^2 - 1' },
]

// ── 16. State & UI ────────────────────────────────────────────────────────────

const state = {
  fStr: 'x^2 + y^2 - 1',
  gStr: '2*y - 1',
  showComplexShadows: true,
  showInfinityPoints: true,
  cam: { az: 0, el: Math.PI / 2 },  // el = π/2 → top-down (flat) view
  result: null,
}

const inputF = document.getElementById('input-f')
const inputG = document.getElementById('input-g')
const errorF = document.getElementById('error-f')
const errorG = document.getElementById('error-g')
const errorGlobal = document.getElementById('error-global')
const btnCompute = document.getElementById('btn-compute')
const reportSection = document.getElementById('report-section')
const reportRows = document.getElementById('report-rows')
const warningSection = document.getElementById('warning-section')
const warningList = document.getElementById('warning-list')
const togComplex  = document.getElementById('tog-complex')
const togInfinity = document.getElementById('tog-infinity')
const togWarnings = document.getElementById('tog-warnings')
const exampleGrid = document.getElementById('example-grid')

function clearErrors() {
  errorF.textContent = ''
  errorG.textContent = ''
  errorGlobal.textContent = ''
  inputF.classList.remove('error')
  inputG.classList.remove('error')
}

// Convert the algebraic solver's BezoutPoint[] into the shapes the renderer
// consumes (affine dots / infinity directions), carrying multiplicity through.
function adaptSolverPoints(solverPoints) {
  const affinePoints = []
  const infinityPoints = []
  for (const p of solverPoints) {
    const [X, Y, Z] = p.originalProjective
    const residual = Math.max(p.residualF, p.residualG)
    if (p.type === 'real_affine' || p.type === 'complex_affine') {
      affinePoints.push({
        x: cDiv(X, Z), y: cDiv(Y, Z),
        kind: p.type === 'real_affine' ? 'real-affine' : 'complex-affine',
        multiplicity: p.multiplicity, residual, proj: [X, Y, Z], warnings: [],
      })
    } else {
      infinityPoints.push({
        X, Y, Z: { re: 0, im: 0 },
        kind: p.type === 'real_infinity' ? 'real-infinity' : 'complex-infinity',
        multiplicity: p.multiplicity, residual, proj: [X, Y, Z], warnings: [],
      })
    }
  }
  return { affinePoints, infinityPoints }
}

function compute() {
  clearErrors()

  // Parse to BiPoly for the curve rendering + cheap input validation.
  let fPoly, gPoly
  try { fPoly = parseBiPoly(inputF.value) }
  catch (e) { errorF.textContent = e.message; inputF.classList.add('error'); return }
  try { gPoly = parseBiPoly(inputG.value) }
  catch (e) { errorG.textContent = e.message; inputG.classList.add('error'); return }

  const valErrs = validateInput(fPoly, gPoly)
  if (valErrs.length) {
    errorGlobal.textContent = valErrs.join('; ')
    state.result = null
    render()
    return
  }

  state.fStr = inputF.value
  state.gStr = inputG.value

  // Algebraic intersection + multiplicity engine.
  const solve = solveBezoutSystem(inputF.value, inputG.value)

  if (solve.status === 'parse_error') {
    errorGlobal.textContent = solve.errors.join('; ')
    state.result = null
    render()
    return
  }

  const { affinePoints, infinityPoints } = adaptSolverPoints(solve.points)

  const warnings = [...(solve.warnings ?? []), ...(solve.errors ?? [])]
  if (solve.status === 'common_component_suspected')
    warnings.unshift('Common component suspected: f and g share a curve. Finite intersection counting is invalid.')
  else if (solve.status === 'failed')
    warnings.unshift('No generic integer projective transform found within the attempt budget.')

  state.result = {
    valid: true,
    fPoly, gPoly,
    status: solve.status,
    degF: solve.degreeF, degG: solve.degreeG,
    expectedBezoutCount: solve.expectedBezoutCount,
    totalMultiplicity: solve.totalMultiplicity,
    transform: solve.transform,
    attemptsTried: solve.attempts ? solve.attempts.length : 0,
    affinePoints, infinityPoints,
    solverPoints: solve.points,
    // disk-space curve segments — extracted once here, only re-projected on rotate
    segF: computeCurveSegments(fPoly),
    segG: computeCurveSegments(gPoly),
    warnings,
  }

  updateReport()
  render()
}

const STATUS_LABEL = {
  ok: ['OK', '#44e2cd'],
  common_component_suspected: ['Common component', '#ffa94d'],
  failed: ['Failed', '#ff6b6b'],
  parse_error: ['Parse error', '#ff6b6b'],
}
const TYPE_LABEL = {
  real_affine: ['real affine', '#ffffff'],
  complex_affine: ['complex affine', '#ff88cc'],
  real_infinity: ['real ∞', '#44e2cd'],
  complex_infinity: ['complex ∞', '#ffafd3'],
}

function fmtProj(proj) {
  return `[${fmtComplex(proj[0], 2)} : ${fmtComplex(proj[1], 2)} : ${fmtComplex(proj[2], 2)}]`
}

function updateReport() {
  if (!state.result) { reportSection.style.display = 'none'; warningSection.style.display = 'none'; return }
  const r = state.result
  const [statusText, statusColor] = STATUS_LABEL[r.status] ?? [r.status, 'var(--accent)']
  const countOk = r.totalMultiplicity === r.expectedBezoutCount
  const transformStr = r.transform ? r.transform.map(row => row.join(' ')).join(' | ') : '—'

  const rows = [
    ['Status', `<span style="color:${statusColor}">${statusText}</span>`],
    ['Method', 'resultant + multiplicity'],
    ['deg(f) · deg(g)', `${r.degF} · ${r.degG}`],
    ['Bézout count', `<span style="color:${countOk ? '#44e2cd' : '#ffa94d'}">${r.totalMultiplicity} / ${r.expectedBezoutCount}</span>`],
    ['Distinct points', r.solverPoints.length],
    ['Transform A', `<span style="font-size:0.7rem">${transformStr}</span>`],
    ['Transforms tried', r.attemptsTried],
  ]

  let html = rows.map(([k, v]) =>
    `<div class="bezout-report-row"><span class="bezout-report-key">${k}</span><span class="bezout-report-val">${v}</span></div>`
  ).join('')

  if (r.solverPoints.length) {
    html += '<div class="bezout-section-title" style="margin-top:10px">Points (with multiplicity)</div>'
    html += r.solverPoints.map(p => {
      const [label, color] = TYPE_LABEL[p.type] ?? [p.type, 'var(--accent)']
      return `<div class="bezout-point">
        <div class="bezout-point-coord">${fmtProj(p.originalProjective)}</div>
        <div class="bezout-point-meta"><span style="color:${color}">${label}</span> · m=${p.multiplicity} · r=${p.residualF.toExponential(1)}</div>
      </div>`
    }).join('')
  }

  reportRows.innerHTML = html
  reportSection.style.display = ''

  const warns = togWarnings.checked ? r.warnings : []
  if (warns.length) {
    warningList.innerHTML = warns.map(w => `<li class="bezout-warning-item">${w}</li>`).join('')
    warningSection.style.display = ''
  } else {
    warningSection.style.display = 'none'
  }
}

// Example buttons
for (const ex of EXAMPLES) {
  const btn = document.createElement('button')
  btn.className = 'bezout-example-btn'
  btn.textContent = ex.label
  btn.addEventListener('click', () => {
    inputF.value = ex.f
    inputG.value = ex.g
    compute()
  })
  exampleGrid.appendChild(btn)
}

// Compute button
btnCompute.addEventListener('click', compute)

// Enter key in inputs
for (const inp of [inputF, inputG]) {
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') compute() })
}

// Toggles
togComplex.addEventListener('change', () => { state.showComplexShadows = togComplex.checked; render() })
togInfinity.addEventListener('change', () => { state.showInfinityPoints = togInfinity.checked; render() })
togWarnings.addEventListener('change', () => updateReport())

// ── Orbit drag + hover tooltip ──────────────────────────────────────────────
const EL_MIN = 0.12, EL_MAX = Math.PI / 2  // keep the camera above the plane
let drag = null

canvas.addEventListener('mousedown', e => {
  drag = { x: e.clientX, y: e.clientY, az: state.cam.az, el: state.cam.el, moved: false }
  tooltip.style.display = 'none'
  canvas.style.cursor = 'grabbing'
})
window.addEventListener('mouseup', () => { drag = null; canvas.style.cursor = 'grab' })

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const dpr = window.devicePixelRatio || 1
  const W = canvas.width / dpr, H = canvas.height / dpr

  if (drag) {  // orbit the camera
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    state.cam.az = drag.az - dx * 0.01
    state.cam.el = Math.max(EL_MIN, Math.min(EL_MAX, drag.el - dy * 0.01))  // drag down → tilt edge-on
    render()
    return
  }

  const pt = findNearestPoint(mx, my, W, H)
  if (pt) {
    tooltip.style.display = 'block'
    tooltip.innerHTML = buildTooltipHTML(pt)
    let tx = mx + 14, ty = my - 10
    const tw = 250, th = 120
    if (tx + tw > W) tx = mx - tw - 10
    if (ty + th > H) ty = my - th
    tooltip.style.left = tx + 'px'
    tooltip.style.top = ty + 'px'
  } else {
    tooltip.style.display = 'none'
  }
})
canvas.addEventListener('mouseleave', () => { if (!drag) tooltip.style.display = 'none' })
canvas.style.cursor = 'grab'

// Reset-view button → top-down (flat) orientation
const btnResetView = document.getElementById('btn-reset-view')
if (btnResetView) btnResetView.addEventListener('click', () => {
  state.cam.az = 0; state.cam.el = Math.PI / 2; render()
})

// Resize
const ro = new ResizeObserver(() => render())
ro.observe(canvas.parentElement)

// Initial compute
compute()
