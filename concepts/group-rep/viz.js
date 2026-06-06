import { resizeCanvas } from '../../shared/canvas-utils.js'

// ── 색상 상수 ───────────────────────────────────────────────────────────────
const C = {
  bg:       '#0d0f14',
  axis:     'rgba(255,255,255,0.18)',
  vec1:     '#e05c5c',   // x (빨강)
  vec2:     '#5c9de0',   // y (파랑)
  vec3:     '#5ce05c',   // z (초록)
  vec4:     '#e0c05c',   // w (노랑)
  shape:    'rgba(91,141,238,0.18)',
  shapeLine:'rgba(91,141,238,0.7)',
  dot:      '#ffffff',
  accentHi: '#7aa5f5',
  text:     'rgba(255,255,255,0.45)',
}

const EDGE_COLORS = [C.vec1, C.vec2, C.vec3, C.vec4]

// ── 보간 ────────────────────────────────────────────────────────────────────

function smoothstep(t) { return t * t * (3 - 2 * t) }

function lerpMat(A, B, t) {
  return A.map((row, i) => row.map((v, j) => v + (B[i][j] - v) * t))
}

function identityR(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )
}

// ── 2D 투영 (고차원 fallback) ────────────────────────────────────────────────

export function randomProjection(dim) {
  const rows = [
    Array.from({ length: dim }, () => (Math.random() - 0.5)),
    Array.from({ length: dim }, () => (Math.random() - 0.5)),
  ]
  const dot  = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
  const scale = (a, k) => a.map(v => v * k)
  const sub  = (a, b) => a.map((v, i) => v - b[i])
  const norm = a => Math.sqrt(dot(a, a))
  rows[0] = scale(rows[0], 1 / norm(rows[0]))
  rows[1] = sub(rows[1], scale(rows[0], dot(rows[1], rows[0])))
  rows[1] = scale(rows[1], 1 / norm(rows[1]))
  return rows
}

export function project(P, v) {
  return [
    P[0].reduce((s, p, i) => s + p * v[i], 0),
    P[1].reduce((s, p, i) => s + p * v[i], 0),
  ]
}

// ── Orbit 다면체 전처리 ──────────────────────────────────────────────────────

// 2D: orbit 점들을 각도 순으로 정렬하고 identity vertex 인덱스를 찾는다.
function buildPoly2D(pts) {
  const sorted = [...pts].sort((a, b) =>
    Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])
  )
  let idIdx = 0, minDist = Infinity
  sorted.forEach((p, i) => {
    const d = Math.hypot(p[0] - 1, p[1])
    if (d < minDist) { minDist = d; idIdx = i }
  })
  return { pts: sorted, idIdx }
}

// 3D: 볼록 껍질(convex hull) 계산 — O(n⁴) brute-force (n ≤ 30 정도로 충분히 빠름).
function buildHull3D(pts) {
  const n = pts.length
  const cross = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    return [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cen = pts.reduce(
    (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]
  ).map(v => v / n)

  const faces = []
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const norm = cross(pts[i], pts[j], pts[k])
        const d = dot(norm, pts[i])
        let side = null, ok = true
        for (let l = 0; l < n; l++) {
          if (l === i || l === j || l === k) continue
          const s = dot(norm, pts[l]) - d
          if (Math.abs(s) < 1e-7) continue
          const sg = Math.sign(s)
          if (side === null) side = sg
          else if (sg !== side) { ok = false; break }
        }
        if (ok && side !== null) {
          const dc = dot(norm, cen) - d
          faces.push(dc < 0 ? [i, j, k] : [i, k, j])
        }
      }

  // 에지 수집 — 두 인접 삼각형이 같은 평면에 있으면(비삼각형 면의 내부 에지) 제외
  const facesByEdge = new Map()
  for (const face of faces) {
    const [a, b, c] = face
    for (const [p, q] of [[a, b], [b, c], [a, c]]) {
      const key = Math.min(p, q) + ',' + Math.max(p, q)
      if (!facesByEdge.has(key)) facesByEdge.set(key, [])
      facesByEdge.get(key).push(face)
    }
  }

  const len3 = v => Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2])
  const normalize3 = v => { const l=len3(v); return [v[0]/l,v[1]/l,v[2]/l] }

  const edges = []
  for (const [key, adj] of facesByEdge) {
    if (adj.length !== 2) { edges.push(key.split(',').map(Number)); continue }
    const n1 = normalize3(cross(pts[adj[0][0]], pts[adj[0][1]], pts[adj[0][2]]))
    const n2 = normalize3(cross(pts[adj[1][0]], pts[adj[1][1]], pts[adj[1][2]]))
    const cosA = Math.abs(n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2])
    if (cosA < 0.9999) edges.push(key.split(',').map(Number))  // non-coplanar → real edge
  }

  // identity 꼭짓점 (e₁ = (1,0,0) 에 가장 가까운 점)
  let idIdx = 0, minDist = Infinity
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - 1, p[1], p[2])
    if (d < minDist) { minDist = d; idIdx = i }
  })

  return { faces, edges, idIdx }
}

// ── Visualizer 클래스 ────────────────────────────────────────────────────────

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.W = 0; this.H = 0

    this.targetMatrix  = null
    this.currentMatrix = null
    this.startMatrix   = null
    this.animStart     = null
    this.animDuration  = 450

    this.dim        = 1
    this.orbitPts   = null   // 원래 orbit 점들 (rest 위치)
    this._poly2D    = null   // buildPoly2D 결과
    this._hull3D    = null   // buildHull3D 결과
    this.projection = null   // dim≥4 fallback

    this._rafId = null
    this._loop  = this._loop.bind(this)
  }

  init(dim, orbitPts) {
    this.dim      = dim
    this.orbitPts = orbitPts

    if (dim === 2 && orbitPts) this._poly2D = buildPoly2D(orbitPts)
    if (dim === 3 && orbitPts) this._hull3D = buildHull3D(orbitPts)
    if (dim >= 4)               this.projection = randomProjection(dim)

    const I = identityR(dim)
    this.currentMatrix = I
    this.startMatrix   = I
    this.targetMatrix  = I
    this.animStart     = null

    if (dim === 3) {
      this.orbitTheta = Math.PI / 4
      this.orbitPhi   = Math.PI / 6
      this._setupOrbit()
    } else {
      this._teardownOrbit()
    }

    this._resize()
    this._startLoop()
  }

  setTarget(M) {
    this.startMatrix = this.currentMatrix
    this.animStart   = performance.now()
    this.targetMatrix = M
  }

  reset() {
    this.setTarget(identityR(this.dim))
  }

  _resize() {
    resizeCanvas(this.canvas)
    const r = this.canvas.parentElement.getBoundingClientRect()
    this.W = r.width; this.H = r.height
  }

  _loop(ts) {
    this._rafId = requestAnimationFrame(this._loop)
    this._resize()
    this._update(ts)
    this._draw()
  }

  _startLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = requestAnimationFrame(this._loop)
  }

  _update(ts) {
    if (!this.animStart) return
    const t = Math.min((ts - this.animStart) / this.animDuration, 1)
    this.currentMatrix = lerpMat(this.startMatrix, this.targetMatrix, smoothstep(t))
    if (t >= 1) this.animStart = null
  }

  _draw() {
    const { ctx, W, H, dim } = this
    ctx.clearRect(0, 0, W, H)

    if      (dim === 1) this._draw1DR()
    else if (dim === 2) this._drawPoly2D()
    else if (dim === 3) this._drawPoly3D()
    else                this._drawND()
  }

  // ── 1D 실수 ────────────────────────────────────────────────────────────

  _draw1DR() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const scale = W * 0.25

    ctx.beginPath()
    ctx.moveTo(cx - scale * 1.6, cy); ctx.lineTo(cx + scale * 1.6, cy)
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5; ctx.stroke()

    for (const v of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + v * scale, cy - 6); ctx.lineTo(cx + v * scale, cy + 6)
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = C.text; ctx.font = '12px var(--font-mono, monospace)'
      ctx.textAlign = 'center'
      ctx.fillText(v, cx + v * scale, cy + 20)
    }

    const val = this.currentMatrix[0][0]
    const dotX = cx + val * scale

    drawArrow(ctx, cx, cy, cx + scale, cy, C.vec1 + '60', 8)
    drawArrow(ctx, cx, cy, dotX, cy, C.vec1, 10)

    ctx.fillStyle = C.accentHi; ctx.font = '14px var(--font-mono, monospace)'
    ctx.textAlign = 'center'
    ctx.fillText(formatReal(val), dotX, cy - 24)
  }

  // ── 2D 궤도 다각형 ─────────────────────────────────────────────────────

  _drawPoly2D() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const unit = Math.min(W, H) * 0.26
    const M = this.currentMatrix

    const applyM = ([x, y]) => [
      M[0][0] * x + M[0][1] * y,
      M[1][0] * x + M[1][1] * y,
    ]
    const toSc = ([x, y]) => [cx + x * unit, cy - y * unit]

    // 고정 좌표축
    const AX = 1.4
    drawArrow(ctx, cx, cy, cx + AX * unit, cy,             C.vec1, 9)
    drawArrow(ctx, cx, cy, cx,             cy - AX * unit, C.vec2, 9)
    ctx.font = '12px var(--font-mono, monospace)'; ctx.textBaseline = 'middle'
    ctx.fillStyle = C.vec1; ctx.textAlign = 'left'
    ctx.fillText('x', cx + AX * unit + 10, cy)
    ctx.fillStyle = C.vec2; ctx.textAlign = 'center'
    ctx.fillText('y', cx, cy - AX * unit - 14)

    // 원점
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    if (!this._poly2D) return
    const { pts: sortedPts, idIdx } = this._poly2D
    const n = sortedPts.length

    // 각 궤도 점에 현재 행렬 M 적용
    const sPts = sortedPts.map(p => toSc(applyM(p)))

    // 채워진 다각형
    ctx.beginPath(); ctx.moveTo(...sPts[0])
    for (let i = 1; i < n; i++) ctx.lineTo(...sPts[i])
    ctx.closePath()
    ctx.fillStyle = C.shape; ctx.fill()
    ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 1.5; ctx.stroke()

    // identity 꼭짓점에서 인접 꼭짓점으로의 채색 에지
    const prev = (idIdx - 1 + n) % n
    const next = (idIdx + 1) % n
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(...sPts[idIdx]); ctx.lineTo(...sPts[prev])
    ctx.strokeStyle = C.vec1; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(...sPts[idIdx]); ctx.lineTo(...sPts[next])
    ctx.strokeStyle = C.vec2; ctx.stroke()
  }

  // ── 3D 궤도 볼록 껍질 ─────────────────────────────────────────────────

  _drawPoly3D() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.27
    const M = this.currentMatrix
    const theta = this.orbitTheta ?? Math.PI / 4
    const phi   = this.orbitPhi   ?? Math.PI / 6

    const applyM = ([x, y, z]) => [
      M[0][0] * x + M[0][1] * y + M[0][2] * z,
      M[1][0] * x + M[1][1] * y + M[1][2] * z,
      M[2][0] * x + M[2][1] * y + M[2][2] * z,
    ]

    const R = buildOrbitMatrix(theta, phi)
    const applyR = ([x, y, z]) => [
      R[0][0] * x + R[0][1] * y + R[0][2] * z,
      R[1][0] * x + R[1][1] * y + R[1][2] * z,
      R[2][0] * x + R[2][1] * y + R[2][2] * z,
    ]
    const proj   = v => { const [rx, ry] = applyR(v); return [cx + rx * scale, cy - ry * scale] }
    const pdepth = v => applyR(v)[2]

    // 고정 좌표축
    const AX_LEN = 1.4
    const axCols  = [C.vec1, C.vec2, C.vec3]
    const axNames = ['x', 'y', 'z']
    for (let i = 0; i < 3; i++) {
      const tip = [0, 0, 0]; tip[i] = AX_LEN
      const [sx, sy] = proj(tip)
      drawArrow(ctx, cx, cy, sx, sy, axCols[i], 9)
      const lblPt = [0, 0, 0]; lblPt[i] = AX_LEN + 0.22
      const [lx, ly] = proj(lblPt)
      ctx.fillStyle = axCols[i]; ctx.font = '12px var(--font-mono, monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(axNames[i], lx, ly)
    }

    // 원점
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    if (!this._hull3D || !this.orbitPts) return
    const { faces, edges, idIdx } = this._hull3D

    // 변환된 궤도 점들
    const wPts = this.orbitPts.map(applyM)
    const sPts = wPts.map(proj)

    // 페인터 알고리즘: 깊이 순 정렬
    const sortedFaces = [...faces].map(f => ({
      f,
      depth: f.reduce((s, i) => s + pdepth(wPts[i]), 0) / f.length,
    })).sort((a, b) => a.depth - b.depth)

    // 면 그리기
    for (const { f } of sortedFaces) {
      const fPts = f.map(i => sPts[i])
      ctx.beginPath(); ctx.moveTo(...fPts[0])
      fPts.slice(1).forEach(p => ctx.lineTo(...p))
      ctx.closePath()
      ctx.fillStyle = C.shape; ctx.fill()
      ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 1.1; ctx.stroke()
    }

    // identity 꼭짓점에서 나가는 에지에 색상 부여
    let colIdx = 0
    for (const [a, b] of edges) {
      if (a === idIdx || b === idIdx) {
        ctx.beginPath()
        ctx.moveTo(...sPts[a]); ctx.lineTo(...sPts[b])
        ctx.strokeStyle = EDGE_COLORS[colIdx % EDGE_COLORS.length]
        ctx.lineWidth = 2.5; ctx.stroke()
        colIdx++
      }
    }

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-sans, sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('Drag to rotate', 12, H - 10)
  }

  // ── nD → 2D 투영 (fallback) ─────────────────────────────────────────────

  _drawND() {
    const { ctx, W, H, dim, projection: P } = this
    if (!P) return
    const cx = W / 2, cy = H / 2
    const unit = Math.min(W, H) * 0.14

    const M = this.currentMatrix
    const applyM = v => v.map((_, i) =>
      M[i].reduce((s, m, j) => s + m * v[j], 0)
    )

    const projBases = Array.from({ length: dim }, (_, j) => {
      const ej = Array(dim).fill(0); ej[j] = 1
      return project(P, applyM(ej))
    })

    const toSc = ([x, y]) => [cx + x * unit, cy - y * unit]
    const b1 = projBases[0], b2 = projBases[1] || [0, 0]
    const RANGE = 3

    for (let i = -RANGE; i <= RANGE; i++) {
      ctx.beginPath()
      ctx.moveTo(...toSc([i * b1[0] + (-RANGE) * b2[0], i * b1[1] + (-RANGE) * b2[1]]))
      ctx.lineTo(...toSc([i * b1[0] +   RANGE  * b2[0], i * b1[1] +   RANGE  * b2[1]]))
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(...toSc([(-RANGE) * b1[0] + i * b2[0], (-RANGE) * b1[1] + i * b2[1]]))
      ctx.lineTo(...toSc([  RANGE  * b1[0] + i * b2[0],   RANGE  * b1[1] + i * b2[1]]))
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke()
    }

    const colors = [C.vec1, C.vec2, C.vec3, C.vec4]
    projBases.forEach((b, j) => {
      const [bx, by] = toSc(b)
      drawArrow(ctx, cx, cy, bx, by, colors[j % colors.length], 8)
    })

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-mono, monospace)'
    ctx.textAlign = 'right'
    ctx.fillText(`${dim}D → 2D projection`, W - 12, H - 10)
  }

  // ── 궤도 카메라 ──────────────────────────────────────────────────────────

  _setupOrbit() {
    this._teardownOrbit()
    const canvas = this.canvas
    canvas.style.cursor = 'grab'
    let dragging = false, lastX = 0, lastY = 0
    const onDown = e => {
      if (e.button !== 0) return
      dragging = true; lastX = e.clientX; lastY = e.clientY
      canvas.style.cursor = 'grabbing'; e.preventDefault()
    }
    const onMove = e => {
      if (!dragging) return
      this.orbitTheta -= (e.clientX - lastX) * 0.008
      this.orbitPhi   -= (e.clientY - lastY) * 0.008
      this.orbitPhi = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.orbitPhi))
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = () => { dragging = false; canvas.style.cursor = 'grab' }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    this._orbitHandlers = { onDown, onMove, onUp }
  }

  _teardownOrbit() {
    if (!this._orbitHandlers) return
    const { onDown, onMove, onUp } = this._orbitHandlers
    this.canvas.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    this.canvas.style.cursor = ''
    this._orbitHandlers = null
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._teardownOrbit()
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function drawArrow(ctx, x1, y1, x2, y2, color, headLen) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 1) return

  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7),
             y2 - headLen * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7),
             y2 - headLen * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fillStyle = color; ctx.fill()
}

function formatReal(v) {
  const r = Math.round(v * 1000) / 1000
  return r === 0 ? '0' : r.toString()
}

// orbit 카메라 회전 행렬
function buildOrbitMatrix(theta, phi) {
  const cy = Math.cos(theta), sy = Math.sin(theta)
  const cp = Math.cos(phi),   sp = Math.sin(phi)
  return [
    [ cy,       0,   sy      ],
    [ sy * sp,  cp, -cy * sp ],
    [-sy * cp,  sp,  cy * cp ],
  ]
}

// 행렬 문자열 변환 (main.js 외부에서 쓰지 않지만 공개해두면 편리)
export function matrixToString(M) {
  if (!M || M.length === 0) return ''
  if (M.length === 1 && M[0].length === 1) return formatReal(M[0][0])
  return M.map(row =>
    '[' + row.map(v => formatReal(v).padStart(7)).join(', ') + ']'
  ).join('\n')
}
