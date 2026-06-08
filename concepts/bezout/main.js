// main.js — Bézout visualizer UI + canvas rendering.
// The intersection / multiplicity computation lives in the separate algebraic
// engine bezout_solver.js (exact resultant + square-free decomposition); this
// file only parses for the curve rendering, calls the solver, and draws.

import { solveBezoutSystem } from './bezout_solver.js'

// ── 1. Constants & tolerances (rendering-side only) ───────────────────────────

const GRID_N          = 160    // marching-squares resolution
const REAL_TOL        = 1e-6   // imaginary-part threshold for display formatting
const POINT_DEDUP_TOL = 1e-4   // conjugate-pair matching tolerance for shadows

// ── 2. Complex arithmetic ──────────────────────────────────────────────────────

function C(re, im = 0) { return { re, im } }
function cSub(a, b) { return C(a.re - b.re, a.im - b.im) }
function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
function cAbs(a)        { return Math.hypot(a.re, a.im) }
function cConj(a)       { return C(a.re, -a.im) }

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

function computeLayout(W, H) {
  const cx = W / 2, cy = H / 2
  const radius = Math.min(W, H) * 0.44
  const margin = radius * 0.62  // inner rect fits inside circle
  const innerRect = {
    left:   cx - margin,
    top:    cy - margin,
    right:  cx + margin,
    bottom: cy + margin,
    width:  2 * margin,
    height: 2 * margin,
    cx, cy
  }
  return { cx, cy, radius, innerRect }
}

function affinePtToCanvas(ax, ay, vp, innerRect) {
  const tx = (ax - vp.xmin) / (vp.xmax - vp.xmin)
  const ty = (ay - vp.ymin) / (vp.ymax - vp.ymin)
  return {
    px: innerRect.left + tx * innerRect.width,
    py: innerRect.bottom - ty * innerRect.height
  }
}

function marchingSquares(poly, vp, N = GRID_N) {
  const dx = (vp.xmax - vp.xmin) / N
  const dy = (vp.ymax - vp.ymin) / N
  // Nudge sampling by an irrational sub-cell fraction so grid vertices never land
  // exactly on symmetric zeros (e.g. a vertex at the origin sitting on a grid line),
  // which would make the sign test degenerate. Shift is ~1e-3 of a cell → invisible.
  const ox = dx * 1.7e-3
  const oy = dy * 1.3e-3
  const grid = []
  for (let j = 0; j <= N; j++) {
    grid.push([])
    for (let i = 0; i <= N; i++) {
      const x = vp.xmin + i * dx + ox
      const y = vp.ymin + j * dy + oy
      // Evaluate using real arithmetic (faster for rendering)
      let val = 0
      for (const [k, cv] of poly) {
        const [pi, pj] = biParsKey(k)
        val += Number(cv) * Math.pow(x, pi) * Math.pow(y, pj)
      }
      grid[j].push(val)
    }
  }

  const segments = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v00 = grid[j][i], v10 = grid[j][i + 1]
      const v01 = grid[j + 1][i], v11 = grid[j + 1][i + 1]
      const x0 = vp.xmin + i * dx + ox, x1 = x0 + dx
      const y0 = vp.ymin + j * dy + oy, y1 = y0 + dy

      // linear interpolation along edge
      function interp(a, b, va, vb) { return a + (b - a) * (-va / (vb - va)) }

      // bits: v00=8 (bottom-left), v10=4 (bottom-right), v11=2 (top-right), v01=1 (top-left)
      const s = (v00 < 0 ? 8 : 0) | (v10 < 0 ? 4 : 0) | (v11 < 0 ? 2 : 0) | (v01 < 0 ? 1 : 0)

      // each lambda interpolates the contour crossing along one cell edge
      const bottom = () => [interp(x0, x1, v00, v10), y0]  // BL→BR
      const top    = () => [interp(x0, x1, v01, v11), y1]  // TL→TR
      const left   = () => [x0, interp(y0, y1, v00, v01)]  // BL→TL
      const right  = () => [x1, interp(y0, y1, v10, v11)]  // BR→TR

      const addSeg = (a, b) => segments.push([a[0], a[1], b[0], b[1]])

      switch (s) {
        case 1: case 14: addSeg(left(), top());     break  // TL isolated
        case 2: case 13: addSeg(top(), right());    break  // TR isolated
        case 3: case 12: addSeg(left(), right());   break  // top/bottom row split
        case 4: case 11: addSeg(bottom(), right()); break  // BR isolated
        case 6: case 9:  addSeg(bottom(), top());   break  // left/right column split
        case 7: case 8:  addSeg(bottom(), left());  break  // BL isolated
        case 5: {  // TL & BR negative — saddle; center sign picks connectivity
          if (v00 + v10 + v11 + v01 < 0) { addSeg(bottom(), left()); addSeg(top(), right()) }
          else { addSeg(left(), top()); addSeg(bottom(), right()) }
          break
        }
        case 10: {  // BL & TR negative — saddle
          if (v00 + v10 + v11 + v01 < 0) { addSeg(left(), top()); addSeg(bottom(), right()) }
          else { addSeg(bottom(), left()); addSeg(top(), right()) }
          break
        }
      }
    }
  }
  return segments
}

function render() {
  const [ctx, W, H] = prep()
  const { cx, cy, radius, innerRect } = computeLayout(W, H)
  const vp = state.viewport

  ctx.clearRect(0, 0, W, H)

  // Layer 1: background (inherited from body)

  // Layer 2: affine rectangle
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(innerRect.left, innerRect.top, innerRect.width, innerRect.height)
  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.font = '10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`x: [${vp.xmin}, ${vp.xmax}]`, cx, innerRect.bottom + 14)
  ctx.textAlign = 'left'
  ctx.fillText(`y: [${vp.ymin}, ${vp.ymax}]`, innerRect.right + 6, cy + 4)
  ctx.restore()

  // Layer 3: infinity circle
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.setLineDash([])
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.font = '9px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('RP¹ (line at ∞)', cx, cy - radius - 6)
  ctx.restore()

  const result = state.result
  if (!result || !result.valid) {
    // Draw empty canvas with hint
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.font = '13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Enter polynomials and press Compute', cx, cy)
    ctx.restore()
    return
  }

  const { fPoly, gPoly, affinePoints, infinityPoints } = result

  // Layer 4: real curves (marching squares)
  const segF = marchingSquares(fPoly, vp)
  const segG = marchingSquares(gPoly, vp)

  function drawCurveSegs(segs, color) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (const [x1, y1, x2, y2] of segs) {
      const p1 = affinePtToCanvas(x1, y1, vp, innerRect)
      const p2 = affinePtToCanvas(x2, y2, vp, innerRect)
      ctx.moveTo(p1.px, p1.py)
      ctx.lineTo(p2.px, p2.py)
    }
    ctx.stroke()
    ctx.restore()
  }

  // Clip to inner rect for curve drawing
  ctx.save()
  ctx.beginPath()
  ctx.rect(innerRect.left - 1, innerRect.top - 1, innerRect.width + 2, innerRect.height + 2)
  ctx.clip()
  drawCurveSegs(segF, 'rgba(100, 180, 255, 0.75)')
  drawCurveSegs(segG, 'rgba(255, 175, 100, 0.75)')
  ctx.restore()

  // Layer 5-6: complex affine shadow lines + ghost points
  if (state.showComplexShadows) {
    for (const pt of affinePoints) {
      if (pt.kind !== 'complex-affine') continue
      const sx = pt.x.re, sy = pt.y.re  // shadow
      const sc = affinePtToCanvas(sx, sy, vp, innerRect)

      // shadow dot
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#ff88cc'
      ctx.beginPath()
      ctx.arc(sc.px, sc.py, 4, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()

      // connector between conjugate pair
      if (pt._conjugate) {
        const cx2 = pt._conjugate.x.re, cy2 = pt._conjugate.y.re
        const sc2 = affinePtToCanvas(cx2, cy2, vp, innerRect)
        ctx.save()
        ctx.globalAlpha = 0.2
        ctx.strokeStyle = '#ff88cc'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(sc.px, sc.py)
        ctx.lineTo(sc2.px, sc2.py)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
    }
  }

  // Layer 7: real affine dots
  for (const pt of affinePoints) {
    if (pt.kind !== 'real-affine') continue
    const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
    // glow
    const grad = ctx.createRadialGradient(px, py, 0, px, py, 8)
    grad.addColorStop(0, 'rgba(255,255,255,0.3)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath(); ctx.arc(px, py, 8, 0, 2 * Math.PI)
    ctx.fillStyle = grad; ctx.fill()
    // dot
    ctx.beginPath(); ctx.arc(px, py, 4, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke()
  }

  // Layer 8: infinity markers
  if (state.showInfinityPoints) {
    for (const pt of infinityPoints) {
      const norm = normalizeInfPt(pt)
      if (pt.kind === 'real-infinity') {
        const theta = Math.atan2(norm.Y.re, norm.X.re)
        drawRealInfinityPt(ctx, cx, cy, radius, theta)
      } else {
        // complex infinity: shadow direction
        let shadowTheta
        if (cAbs(norm.X) >= cAbs(norm.Y)) {
          const t = cDiv(norm.Y, norm.X)
          shadowTheta = Math.atan2(t.re, 1)
        } else {
          const s = cDiv(norm.X, norm.Y)
          shadowTheta = Math.atan2(1, s.re)
        }
        drawComplexInfinityPt(ctx, cx, cy, radius, shadowTheta)
      }
    }
  }
}

function drawRealInfinityPt(ctx, cx, cy, radius, theta) {
  for (const t of [theta, theta + Math.PI]) {
    const px = cx + radius * Math.cos(t)
    const py = cy - radius * Math.sin(t)
    ctx.save()
    ctx.fillStyle = '#44e2cd'
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 5, 0, 2 * Math.PI)
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
}

function drawComplexInfinityPt(ctx, cx, cy, radius, shadowTheta) {
  for (const t of [shadowTheta, shadowTheta + Math.PI]) {
    const px = cx + radius * Math.cos(t)
    const py = cy - radius * Math.sin(t)
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffafd3'
    ctx.strokeStyle = 'rgba(255,175,211,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, 2 * Math.PI)
    ctx.fill(); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

// ── 14. Tooltip hit-testing ────────────────────────────────────────────────────

function findNearestPoint(mouseX, mouseY, W, H) {
  if (!state.result || !state.result.valid) return null
  const { cx, cy, radius, innerRect } = computeLayout(W, H)
  const vp = state.viewport
  const HIT_R = 12

  const all = []

  for (const pt of state.result.affinePoints) {
    if (pt.kind === 'real-affine') {
      const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
      all.push({ pt, px, py })
    } else if (state.showComplexShadows) {
      const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
      all.push({ pt, px, py })
    }
  }

  if (state.showInfinityPoints) {
    for (const pt of state.result.infinityPoints) {
      const norm = normalizeInfPt(pt)
      let theta
      if (pt.kind === 'real-infinity') {
        theta = Math.atan2(norm.Y.re, norm.X.re)
      } else {
        if (cAbs(norm.X) >= cAbs(norm.Y)) {
          theta = Math.atan2(cDiv(norm.Y, norm.X).re, 1)
        } else {
          theta = Math.atan2(1, cDiv(norm.X, norm.Y).re)
        }
      }
      const px = cx + radius * Math.cos(theta)
      const py = cy - radius * Math.sin(theta)
      all.push({ pt, px, py })
    }
  }

  let best = null, bestDist = HIT_R
  for (const item of all) {
    const d = Math.hypot(mouseX - item.px, mouseY - item.py)
    if (d < bestDist) { bestDist = d; best = item }
  }
  return best ? best.pt : null
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
  viewport: { xmin: -3, xmax: 3, ymin: -3, ymax: 3 },
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
  linkConjugatePairs(affinePoints)

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
    warnings,
  }

  updateReport()
  render()
}

function linkConjugatePairs(pts) {
  const used = new Set()
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i) || pts[i].kind !== 'complex-affine') continue
    const cx_ = cConj(pts[i].x), cy_ = cConj(pts[i].y)
    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j) || pts[j].kind !== 'complex-affine') continue
      if (cAbs(cSub(pts[j].x, cx_)) < POINT_DEDUP_TOL * 10 &&
          cAbs(cSub(pts[j].y, cy_)) < POINT_DEDUP_TOL * 10) {
        pts[i]._conjugate = pts[j]
        pts[j]._conjugate = pts[i]
        used.add(i); used.add(j); break
      }
    }
  }
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

// Tooltip
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const dpr = window.devicePixelRatio || 1
  const W = canvas.width / dpr, H = canvas.height / dpr
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
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })

// Resize
const ro = new ResizeObserver(() => render())
ro.observe(canvas.parentElement)

// Initial compute
compute()
