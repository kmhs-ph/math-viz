import { resizeCanvas } from '../../shared/canvas-utils.js'

// ── 색상 ────────────────────────────────────────────────────────────────────
const C = {
  axis:      'rgba(255,255,255,0.18)',
  vec1:      '#e05c5c',
  vec2:      '#5c9de0',
  vec3:      '#5ce05c',
  shape:     'rgba(91,141,238,0.16)',
  shapeLine: 'rgba(91,141,238,0.65)',
  accentHi:  '#7aa5f5',
  text:      'rgba(255,255,255,0.45)',
}

export const PALETTE_COLORS = [null, '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff']
const PALETTE_FILLS  = [null, '#ff6b6b99', '#ffd93d99', '#6bcb7799', '#4d96ff99', '#c77dff99']

// ── 3×3 traceless symmetric matrix eigenvalues (ascending) ───────────────────
// Depressed cubic: λ³ − pλ − q = 0  where p = tr(Q²)/2, q = det(Q)
function eigenvalues3x3sym0(Q) {
  const a=Q[0][0], b=Q[1][1], c=Q[2][2], d=Q[0][1], e=Q[0][2], f=Q[1][2]
  const p = (a*a + b*b + c*c + 2*d*d + 2*e*e + 2*f*f) / 2
  if (p < 1e-14) return [0, 0, 0]
  const q  = a*(b*c-f*f) - d*(d*c-f*e) + e*(d*f-b*e)
  const sq = Math.sqrt(p / 3)
  const t  = Math.acos(Math.max(-1, Math.min(1, q / (2*sq*sq*sq)))) / 3
  const TW = 2 * Math.PI / 3
  return [2*sq*Math.cos(t), 2*sq*Math.cos(t-TW), 2*sq*Math.cos(t+TW)].sort((a,b) => a-b)
}

// ── A5 5D 인터트위너: 5D 벡터 → traceless symmetric 3×3 계수 ──────────────
// q = A5_5D_C @ v; Q = Σ qᵢBᵢ (Bᵢ: 표준 traceless symmetric basis)
const A5_5D_C = [
  [-0.3689399728,  0.4614645729,  0.6435705727,  0.4236221911,  0.2393635346],
  [-0.3244184629,  0.3532431018, -0.2631442498, -0.5983493774,  0.5854101966],
  [ 0.7841555589,  0.4699299346,  0.2953027605, -0.2776007849,  0           ],
  [-0.1213152045, -0.5231536855,  0.6552620098, -0.5312480975,  0           ],
  [ 0.3591916453, -0.4095678661,  0,             0.3213028555,  0.7745966692],
]

// ── 수학 헬퍼 ────────────────────────────────────────────────────────────────

function smoothstep(t) { return t * t * (3 - 2 * t) }

function identityR(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )
}

function lerpMat(A, B, t) {
  return A.map((row, i) => row.map((v, j) => v + (B[i][j] - v) * t))
}

function mmul(A, B) {
  return Array.from({ length: A.length }, (_, i) =>
    Array.from({ length: B[0].length }, (_, j) =>
      A[i].reduce((s, v, k) => s + v * B[k][j], 0)
    )
  )
}

function transpose(M) {
  return Array.from({ length: M[0].length }, (_, j) => M.map(row => row[j]))
}

function det2(M) { return M[0][0] * M[1][1] - M[0][1] * M[1][0] }

function det3(M) {
  return (
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  )
}

function crossVec(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
}

function dot3(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2] }

function norm3(v) {
  const l = Math.sqrt(dot3(v, v))
  return l < 1e-12 ? [0,0,0] : [v[0]/l, v[1]/l, v[2]/l]
}

// ── SO(n) 측지선 보간 ────────────────────────────────────────────────────────

// start, target: 모두 SO(2) 원소일 때 — 짧은 호(arc) 경로
function so2Geodesic(start, target) {
  const st = transpose(start)
  const R  = mmul(target, st)
  const angle = Math.atan2(R[1][0], R[0][0])
  return t => {
    const a = t * angle
    const c = Math.cos(a), s = Math.sin(a)
    return mmul([[c,-s],[s,c]], start)
  }
}

// start, target: 모두 SO(3) 원소일 때 — Rodrigues 회전 보간
function so3Geodesic(start, target) {
  const R   = mmul(target, transpose(start))
  const tr  = R[0][0] + R[1][1] + R[2][2]
  const angle = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)))

  if (angle < 1e-10) return _ => target
  if (Math.abs(angle - Math.PI) < 0.05) return null  // 수치 불안정 → linear fallback

  const sinA = Math.sin(angle)
  const ax = (R[2][1]-R[1][2])/(2*sinA)
  const ay = (R[0][2]-R[2][0])/(2*sinA)
  const az = (R[1][0]-R[0][1])/(2*sinA)

  return t => {
    const th = t * angle
    const c = Math.cos(th), s = Math.sin(th), oc = 1 - c
    const Rt = [
      [c+ax*ax*oc,    ax*ay*oc-az*s, ax*az*oc+ay*s],
      [ay*ax*oc+az*s, c+ay*ay*oc,    ay*az*oc-ax*s],
      [az*ax*oc-ay*s, az*ay*oc+ax*s, c+az*az*oc   ],
    ]
    return mmul(Rt, start)
  }
}

// ── 랜덤 투영 ────────────────────────────────────────────────────────────────

// nD → 3D: Gram-Schmidt 직교화로 3×dim 투영행렬 생성
export function randomProjection(dim) {
  const dot   = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
  const scale = (a, k) => a.map(v => v * k)
  const sub   = (a, b) => a.map((v, i) => v - b[i])
  const rows = Array.from({ length: 3 }, () =>
    Array.from({ length: dim }, () => Math.random() - 0.5)
  )
  rows[0] = scale(rows[0], 1 / Math.sqrt(dot(rows[0], rows[0])))
  rows[1] = sub(rows[1], scale(rows[0], dot(rows[1], rows[0])))
  rows[1] = scale(rows[1], 1 / Math.sqrt(dot(rows[1], rows[1])))
  rows[2] = sub(rows[2], scale(rows[0], dot(rows[2], rows[0])))
  rows[2] = sub(rows[2], scale(rows[1], dot(rows[2], rows[1])))
  rows[2] = scale(rows[2], 1 / Math.sqrt(dot(rows[2], rows[2])))
  return rows
}

// nD 벡터를 3D로 투영
function project3(P, v) {
  return [
    P[0].reduce((s, p, i) => s + p * v[i], 0),
    P[1].reduce((s, p, i) => s + p * v[i], 0),
    P[2].reduce((s, p, i) => s + p * v[i], 0),
  ]
}

// ── 구면 메시 ────────────────────────────────────────────────────────────────

function buildSphereMesh(nLat, nLon) {
  const sph = (lat, lon) => [
    Math.sin(lat) * Math.cos(lon),
    Math.sin(lat) * Math.sin(lon),
    Math.cos(lat),
  ]
  const quads = []
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const lat0 = (i       / nLat) * Math.PI
      const lat1 = ((i + 1) / nLat) * Math.PI
      const lon0 = (j       / nLon) * 2 * Math.PI
      const lon1 = ((j + 1) / nLon) * 2 * Math.PI
      quads.push({
        verts: [sph(lat0,lon0), sph(lat0,lon1), sph(lat1,lon1), sph(lat1,lon0)],
        cen:   sph((lat0+lat1)/2, (lon0+lon1)/2),
      })
    }
  }
  return quads
}

// ── 볼록 껍질 ────────────────────────────────────────────────────────────────

function buildHull3D(pts) {
  const n = pts.length
  const crossFace = (a, b, c) => {
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]]
    const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]]
    return crossVec(u, v)
  }
  const cen = pts.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>v/n)

  // Step 1: 모든 볼록 껍질 삼각형 탐색 O(n⁴)
  const faces = []
  for (let i = 0; i < n; i++)
    for (let j = i+1; j < n; j++)
      for (let k = j+1; k < n; k++) {
        const norm = crossFace(pts[i], pts[j], pts[k])
        const d    = dot3(norm, pts[i])
        let side = null, ok = true
        for (let l = 0; l < n; l++) {
          if (l===i||l===j||l===k) continue
          const s = dot3(norm, pts[l]) - d
          if (Math.abs(s) < 1e-6) continue
          const sg = Math.sign(s)
          if (side === null) side = sg
          else if (sg !== side) { ok = false; break }
        }
        if (ok && side !== null) {
          const dc = dot3(norm, cen) - d
          faces.push(dc < 0 ? [i,j,k] : [i,k,j])
        }
      }

  // Step 2: 공면 삼각형을 다각형으로 병합 (삼각형도 그룹에 저장)
  const PREC = 100
  const planeMap = new Map()
  for (const face of faces) {
    const nn = norm3(crossFace(pts[face[0]], pts[face[1]], pts[face[2]]))
    const d  = Math.round(dot3(nn, pts[face[0]]) * PREC) / PREC
    const nk = nn.map(v => Math.round(v * PREC) / PREC).join(',')
    const key = nk + ',' + d
    if (!planeMap.has(key)) planeMap.set(key, { normal: nn, verts: new Set(), tris: [] })
    const entry = planeMap.get(key)
    face.forEach(i => entry.verts.add(i))
    entry.tris.push(face)
  }

  const polygons = []
  for (const { normal: nn, verts } of planeMap.values()) {
    const vidxs = [...verts]
    if (vidxs.length < 3) continue
    const fc = vidxs.reduce((a,i)=>[a[0]+pts[i][0],a[1]+pts[i][1],a[2]+pts[i][2]],[0,0,0]).map(v=>v/vidxs.length)
    const u0 = norm3([pts[vidxs[0]][0]-fc[0], pts[vidxs[0]][1]-fc[1], pts[vidxs[0]][2]-fc[2]])
    const vv = norm3(crossVec(nn, u0))
    vidxs.sort((ia,ib) => {
      const pa=[pts[ia][0]-fc[0],pts[ia][1]-fc[1],pts[ia][2]-fc[2]]
      const pb=[pts[ib][0]-fc[0],pts[ib][1]-fc[1],pts[ib][2]-fc[2]]
      return Math.atan2(dot3(pa,vv),dot3(pa,u0)) - Math.atan2(dot3(pb,vv),dot3(pb,u0))
    })
    polygons.push({ normal: nn, verts: vidxs })
  }

  // Step 3: 다각형 그룹 기준 에지-평면 인접 관계 구축
  // (삼각형 기준으로 하면 정사각형·육각형 내부 에지가 adj.length>2 가 되어 잘못 처리됨)
  const edgeToPlane = new Map()
  for (const [planeKey, { normal: nn, tris }] of planeMap) {
    for (const face of tris) {
      const [a,b,c] = face
      for (const [p,q] of [[a,b],[b,c],[a,c]]) {
        const ek = Math.min(p,q)+','+Math.max(p,q)
        if (!edgeToPlane.has(ek)) edgeToPlane.set(ek, new Map())
        edgeToPlane.get(ek).set(planeKey, nn)  // 같은 planeKey는 덮어쓰기로 중복 제거
      }
    }
  }
  const edges = []
  for (const [ek, groups] of edgeToPlane) {
    const [a, b] = ek.split(',').map(Number)
    const gs = [...groups.values()]
    if (gs.length === 2) edges.push({ a, b, n1: gs[0], n2: gs[1] })
    // gs.length === 1: 다각형 내부 에지 → 제외
    // gs.length  >  2: 비다양체 → 제외
  }

  // Step 4: identity 꼭짓점 (e₁=(1,0,0) 에 가장 가까운 점)
  let idIdx = 0, minDist = Infinity
  pts.forEach((p,i) => {
    const d = Math.hypot(p[0]-1, p[1], p[2])
    if (d < minDist) { minDist = d; idIdx = i }
  })

  return { polygons, edges, idIdx }
}

// ── click 보조 함수 ──────────────────────────────────────────────────────────

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay
  const lenSq = dx*dx + dy*dy
  if (lenSq < 1e-10) return Math.hypot(px-ax, py-ay)
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq))
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy))
}

function pointInPoly(px, py, pts) {
  const n = pts.length
  let sign = 0
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i+1) % n]
    const cross = (bx-ax)*(py-ay) - (by-ay)*(px-ax)
    if (Math.abs(cross) < 0.5) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return sign !== 0
}

// ── Visualizer ────────────────────────────────────────────────────────────────

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
    this._animMode     = 'linear'
    this._geodesicFn   = null

    this.dim        = 1
    this.vizMode    = null
    this.orbitPts   = null
    this._poly2D    = null
    this._hull3D    = null
    this._sphereMesh = null
    this.projection = null

    this.markedEdges  = new Map()   // 2D용
    this.markedFaces  = new Map()   // 3D용
    this.paletteIdx   = 0           // 0 = erase, 1-5 = color
    this._screenEdges = []          // 2D 변 클릭 감지
    this._screenPolys = []          // 3D 면 클릭 감지
    this.onBaseVecPick    = null       // (v: number[]) => void, 3D base vector 선택 콜백
    this._widgetCanvas    = null       // base vector mini-sphere widget
    this._widgetBaseVec   = null
    this._widgetHandlers  = null

    this._rafId          = null
    this._clickHandler   = null
    this._orbitHandlers  = null
    this._loop           = this._loop.bind(this)
  }

  init(dim, orbitPts, vizMode = null) {
    this.dim         = dim
    this.vizMode     = vizMode
    this.orbitPts    = orbitPts
    this._sphereMesh = null
    this.markedEdges.clear()
    this.markedFaces.clear()
    this._screenEdges = []
    this._screenPolys = []

    if (dim === 2 && orbitPts) this._poly2D  = buildPoly2D(orbitPts)
    if (dim === 3 && orbitPts) this._hull3D  = buildHull3D(orbitPts)
    if (dim >= 4 && orbitPts && !vizMode) {
      this.projection = randomProjection(dim)
      this._hullND    = buildHull3D(orbitPts.map(v => project3(this.projection, v)))
    }
    if (vizMode === 'sphere5D') this._sphereMesh = buildSphereMesh(24, 48)

    const I = identityR(dim)
    this.currentMatrix = I; this.startMatrix = I; this.targetMatrix = I
    this.animStart = null; this._animMode = 'linear'; this._geodesicFn = null

    // Click handler 설정
    if (this._clickHandler) {
      this.canvas.removeEventListener('click', this._clickHandler)
      this._clickHandler = null
    }
    if (dim === 2) {
      this._clickHandler = e => this._handleEdgeClick(e)
      this.canvas.addEventListener('click', this._clickHandler)
    }

    if (dim >= 3) {
      this.orbitTheta = -Math.PI / 4
      this.orbitPhi   = Math.PI / 6
      this._setupOrbit()
    } else {
      this._teardownOrbit()
    }

    this._resize()
    this._startLoop()
  }

  setTarget(M) {
    this.startMatrix  = this.currentMatrix
    this.animStart    = performance.now()
    this.targetMatrix = M
    this._animMode    = 'linear'
    this._geodesicFn  = null

    const dim = this.dim
    if (dim < 2 || dim > 3) return

    const dStart  = dim === 2 ? det2(this.startMatrix)  : det3(this.startMatrix)
    const dTarget = dim === 2 ? det2(M)                  : det3(M)
    // 증분 변환 det = dStart·dTarget; ≈1 이면 SO(n) → 측지선, ≈-1 이면 반사 포함 → linear
    if (Math.abs(dStart * dTarget - 1) > 0.01) return

    const fn = dim === 2
      ? so2Geodesic(this.startMatrix, M)
      : so3Geodesic(this.startMatrix, M)
    if (fn) { this._animMode = 'geodesic'; this._geodesicFn = fn }
  }

  reset() {
    this.setTarget(identityR(this.dim))
  }

  reproject() {
    if (this.dim < 4 || !this.orbitPts) return
    this.projection = randomProjection(this.dim)
    this._hullND    = buildHull3D(this.orbitPts.map(v => project3(this.projection, v)))
    this.markedFaces.clear()
  }

  updateOrbit(pts) {
    this.orbitPts = pts
    if (!pts) return
    if (this.dim === 2) this._poly2D = buildPoly2D(pts)
    if (this.dim === 3) this._hull3D = buildHull3D(pts)
    if (this.dim >= 4 && !this.vizMode && this.projection)
      this._hullND = buildHull3D(pts.map(v => project3(this.projection, v)))
    this.markedFaces.clear()
    this.markedEdges.clear()
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
    this._drawWidget()
  }

  _startLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = requestAnimationFrame(this._loop)
  }

  _update(ts) {
    if (!this.animStart) return
    const t = Math.min((ts - this.animStart) / this.animDuration, 1)
    const e = smoothstep(t)

    if (this._animMode === 'geodesic' && this._geodesicFn) {
      this.currentMatrix = this._geodesicFn(e)
    } else {
      this.currentMatrix = lerpMat(this.startMatrix, this.targetMatrix, e)
    }
    if (t >= 1) { this.animStart = null; this.currentMatrix = this.targetMatrix }
  }

  _draw() {
    const { ctx, W, H } = this
    ctx.clearRect(0, 0, W, H)
    this._screenEdges = []
    this._screenPolys = []

    if      (this.dim === 1)                  this._draw1DR()
    else if (this.dim === 2)                  this._drawPoly2D()
    else if (this.dim === 3)                  this._drawPoly3D()
    else if (this.vizMode === 'simplex4D')    this._drawSimplex4D()
    else if (this.vizMode === 'sphere5D')     this._drawSphere5D()
    else                                      this._drawND()
  }

  // ── 1D ────────────────────────────────────────────────────────────────────

  _draw1DR() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const scale = W * 0.25

    ctx.beginPath(); ctx.moveTo(cx - scale*1.6, cy); ctx.lineTo(cx + scale*1.6, cy)
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5; ctx.stroke()

    for (const v of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(cx+v*scale, cy-6); ctx.lineTo(cx+v*scale, cy+6)
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = C.text; ctx.font = '12px var(--font-mono,monospace)'
      ctx.textAlign = 'center'; ctx.fillText(v, cx+v*scale, cy+20)
    }

    const val = this.currentMatrix[0][0]
    drawArrow(ctx, cx, cy, cx + scale, cy, C.vec1 + '60', 8)
    drawArrow(ctx, cx, cy, cx + val * scale, cy, C.vec1, 10)
    ctx.fillStyle = C.accentHi; ctx.font = '14px var(--font-mono,monospace)'
    ctx.textAlign = 'center'
    ctx.fillText(fmtR(val), cx + val * scale, cy - 24)
  }

  // ── 2D 궤도 다각형 ─────────────────────────────────────────────────────────

  _drawPoly2D() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const unit = Math.min(W, H) * 0.26
    const M = this.currentMatrix

    const applyM = ([x,y]) => [M[0][0]*x+M[0][1]*y, M[1][0]*x+M[1][1]*y]
    const toSc   = ([x,y]) => [cx + x*unit, cy - y*unit]

    // 고정 좌표축
    const AX = 1.4
    drawArrow(ctx, cx, cy, cx+AX*unit, cy, C.vec1, 9)
    drawArrow(ctx, cx, cy, cx, cy-AX*unit, C.vec2, 9)
    ctx.font = '12px var(--font-mono,monospace)'; ctx.textBaseline = 'middle'
    ctx.fillStyle = C.vec1; ctx.textAlign = 'left';   ctx.fillText('x', cx+AX*unit+10, cy)
    ctx.fillStyle = C.vec2; ctx.textAlign = 'center'; ctx.fillText('y', cx, cy-AX*unit-14)
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    if (!this._poly2D) return
    const { pts } = this._poly2D
    const n = pts.length
    const sPts = pts.map(p => toSc(applyM(p)))

    // 채워진 다각형
    ctx.beginPath(); ctx.moveTo(...sPts[0])
    for (let i = 1; i < n; i++) ctx.lineTo(...sPts[i])
    ctx.closePath()
    ctx.fillStyle = C.shape; ctx.fill()

    // 에지 (변 마킹 색 적용)
    for (let i = 0; i < n; i++) {
      const j = (i+1) % n
      const key = Math.min(i,j)+','+Math.max(i,j)
      const mc = this.markedEdges.get(key)
      ctx.beginPath(); ctx.moveTo(...sPts[i]); ctx.lineTo(...sPts[j])
      ctx.strokeStyle = mc ? PALETTE_COLORS[mc] : C.shapeLine
      ctx.lineWidth   = mc ? 2.8 : 1.5; ctx.stroke()
      this._screenEdges.push({ key, a: [...sPts[i]], b: [...sPts[j]] })
    }
  }

  // ── 3D 궤도 볼록 껍질 ─────────────────────────────────────────────────────

  _drawPoly3D() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.27
    const M  = this.currentMatrix
    const th = this.orbitTheta ?? Math.PI / 4
    const ph = this.orbitPhi   ?? Math.PI / 6

    const applyM = ([x,y,z]) => [
      M[0][0]*x+M[0][1]*y+M[0][2]*z,
      M[1][0]*x+M[1][1]*y+M[1][2]*z,
      M[2][0]*x+M[2][1]*y+M[2][2]*z,
    ]
    const R = buildOrbitMat(th, ph)
    const applyR = ([x,y,z]) => [
      R[0][0]*x+R[0][1]*y+R[0][2]*z,
      R[1][0]*x+R[1][1]*y+R[1][2]*z,
      R[2][0]*x+R[2][1]*y+R[2][2]*z,
    ]
    const proj   = v => { const [rx,ry] = applyR(v); return [cx+rx*scale, cy-ry*scale] }
    const pdepth = v => applyR(v)[2]

    // 고정 좌표축
    const AX_LEN = 1.4, axCols = [C.vec1, C.vec2, C.vec3], axNames = ['x','y','z']
    for (let i = 0; i < 3; i++) {
      const tip = [0,0,0]; tip[i] = AX_LEN
      drawArrow(ctx, cx, cy, ...proj(tip), axCols[i], 9)
      const lp = [0,0,0]; lp[i] = AX_LEN + 0.22
      const [lx, ly] = proj(lp)
      ctx.fillStyle = axCols[i]; ctx.font = '12px var(--font-mono,monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(axNames[i], lx, ly)
    }
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    if (!this._hull3D || !this.orbitPts) return
    const { polygons, edges } = this._hull3D

    const wPts = this.orbitPts.map(applyM)
    const sPts = wPts.map(proj)

    // 면 그리기 — 전체 투시, 깊이 정렬(뒤→앞), 면 마킹 색 적용
    const sortedPolys = polygons
      .map((poly, idx) => ({
        poly, idx,
        depth: poly.verts.reduce((s,i)=>s+pdepth(wPts[i]),0)/poly.verts.length
      }))
      .sort((a,b) => a.depth - b.depth)

    for (const { poly, idx } of sortedPolys) {
      const fPts = poly.verts.map(i => sPts[i])
      ctx.beginPath(); ctx.moveTo(...fPts[0])
      fPts.slice(1).forEach(p => ctx.lineTo(...p))
      ctx.closePath()
      const mc = this.markedFaces.get(idx)
      ctx.fillStyle = mc ? PALETTE_FILLS[mc] : C.shape; ctx.fill()
      this._screenPolys.push({ idx, pts: fPts })
    }

    // 에지 그리기 — 모든 변 표시, 깊이로 굵기 구분
    for (const { a, b } of edges) {
      const depth = (pdepth(wPts[a]) + pdepth(wPts[b])) / 2
      ctx.beginPath(); ctx.moveTo(...sPts[a]); ctx.lineTo(...sPts[b])
      ctx.strokeStyle = depth > 0 ? C.shapeLine : 'rgba(91,141,238,0.30)'
      ctx.lineWidth   = depth > 0 ? 1.4 : 0.7
      ctx.stroke()
    }

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-sans,sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('Drag to rotate', 12, H - 10)
  }

  // ── A5 4D: 4-simplex Schlegel diagram ────────────────────────────────────

  _drawSimplex4D() {
    const { ctx, W, H } = this
    if (!this.orbitPts || this.orbitPts.length < 5) return

    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.38
    const M  = this.currentMatrix
    const th = this.orbitTheta ?? -Math.PI / 4
    const ph = this.orbitPhi   ?? Math.PI / 6

    const d = 1.5
    const applyM4  = v => M.map(row => row.reduce((s, c, k) => s + c * v[k], 0))
    const proj4to3 = ([x, y, z, w]) => { const f = d / (d - w); return [x*f, y*f, z*f] }

    const R      = buildOrbitMat(th, ph)
    const applyR = ([x,y,z]) => [
      R[0][0]*x+R[0][1]*y+R[0][2]*z,
      R[1][0]*x+R[1][1]*y+R[1][2]*z,
      R[2][0]*x+R[2][1]*y+R[2][2]*z,
    ]
    const toSc  = v => { const [rx,ry] = applyR(v); return [cx+rx*scale, cy-ry*scale] }
    const depth = v => applyR(v)[2]

    const verts4 = this.orbitPts.map(applyM4)
    const verts3 = verts4.map(proj4to3)
    const scrn   = verts3.map(toSc)
    const deps   = verts3.map(depth)

    // ─ 5 tetrahedral cells: subtle fill for depth cue ─
    const allTris = []
    for (let ci = 0; ci < 5; ci++) {
      const vIdxs = [0,1,2,3,4].filter(k => k !== ci)
      for (let a=0; a<4; a++)
        for (let b=a+1; b<4; b++)
          for (let c=b+1; c<4; c++) {
            const [ia, ib, ic] = [vIdxs[a], vIdxs[b], vIdxs[c]]
            allTris.push({ ia, ib, ic, dep: (deps[ia]+deps[ib]+deps[ic]) / 3 })
          }
    }
    allTris.sort((a, b) => a.dep - b.dep)
    for (const { ia, ib, ic, dep } of allTris) {
      ctx.beginPath()
      ctx.moveTo(...scrn[ia]); ctx.lineTo(...scrn[ib]); ctx.lineTo(...scrn[ic]); ctx.closePath()
      ctx.fillStyle = dep > 0 ? 'rgba(91,141,238,0.07)' : 'rgba(91,141,238,0.02)'
      ctx.fill()
    }

    // ─ K₅ edges — colored if marked ─
    for (let i = 0; i < 5; i++)
      for (let j = i+1; j < 5; j++) {
        const key = `${i},${j}`
        const mc  = this.markedEdges.get(key)
        const dep = (deps[i]+deps[j]) / 2
        ctx.beginPath(); ctx.moveTo(...scrn[i]); ctx.lineTo(...scrn[j])
        ctx.strokeStyle = mc
          ? PALETTE_COLORS[mc]
          : (dep > 0 ? C.shapeLine : 'rgba(91,141,238,0.28)')
        ctx.lineWidth = mc ? 3.2 : (dep > 0 ? 1.8 : 0.9)
        ctx.stroke()
        this._screenEdges.push({ key, a: [...scrn[i]], b: [...scrn[j]] })
      }

    // ─ Vertices ─
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(...scrn[i], deps[i] > 0 ? 5 : 3, 0, Math.PI*2)
      ctx.fillStyle = deps[i] > 0 ? C.accentHi : 'rgba(122,165,245,0.45)'
      ctx.fill()
    }

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-sans,sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('4-simplex Schlegel · Drag to rotate · Click to mark cells', 12, H - 10)
  }

  // ── A5 5D: S² coloring by f_Q(u) = u^T Q u ──────────────────────────────

  _drawSphere5D() {
    const { ctx, W, H } = this
    if (!this._sphereMesh) return

    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.32
    const M  = this.currentMatrix
    const th = this.orbitTheta ?? -Math.PI / 4
    const ph = this.orbitPhi   ?? Math.PI / 6

    // v = M @ e₁ = first column of M
    const v = M.map(row => row[0])
    const q = A5_5D_C.map(row => row.reduce((s, c, k) => s + c * v[k], 0))

    // Reconstruct 3×3 traceless symmetric Q from coefficients
    // Basis: B₀=diag(1,-1,0)/√2, B₁=diag(1,1,-2)/√6, B₂,₃,₄=off-diagonal/√2
    const s2 = Math.SQRT2, s6 = Math.sqrt(6)
    const Q = [
      [ q[0]/s2 + q[1]/s6,   q[2]/s2,            q[3]/s2           ],
      [ q[2]/s2,            -q[0]/s2 + q[1]/s6,   q[4]/s2           ],
      [ q[3]/s2,             q[4]/s2,            -2*q[1]/s6         ],
    ]

    const fQ = u => (
      Q[0][0]*u[0]*u[0] + Q[1][1]*u[1]*u[1] + Q[2][2]*u[2]*u[2] +
      2*Q[0][1]*u[0]*u[1] + 2*Q[0][2]*u[0]*u[2] + 2*Q[1][2]*u[1]*u[2]
    )

    const R      = buildOrbitMat(th, ph)
    const applyR = ([x,y,z]) => [
      R[0][0]*x+R[0][1]*y+R[0][2]*z,
      R[1][0]*x+R[1][1]*y+R[1][2]*z,
      R[2][0]*x+R[2][1]*y+R[2][2]*z,
    ]
    const toSc  = v3 => { const [rx,ry] = applyR(v3); return [cx+rx*scale, cy-ry*scale] }
    const depth = v3 => applyR(v3)[2]

    // Sort quads back-to-front (Painter's algorithm)
    const sorted = this._sphereMesh.map(q2 => ({
      verts: q2.verts, f: fQ(q2.cen), depth: depth(q2.cen),
    })).sort((a, b) => a.depth - b.depth)

    for (const quad of sorted) {
      const pts   = quad.verts.map(toSc)
      const front = quad.depth > 0
      const alpha = front ? 0.88 : 0.20
      const t     = quad.f     // C is close-to-orthogonal so ||q||≈1 → |fQ| ≤ 1

      ctx.beginPath()
      ctx.moveTo(...pts[0])
      pts.slice(1).forEach(p => ctx.lineTo(...p))
      ctx.closePath()

      if (Math.abs(t) < 0.04) {
        // Nodal curve region
        ctx.fillStyle = `rgba(20,20,45,${alpha * 0.8})`
      } else if (t > 0) {
        const i = Math.min(1, (t - 0.04) / 0.96)
        ctx.fillStyle = `rgba(77,150,255,${(i * 0.78 + 0.10) * alpha})`
      } else {
        const i = Math.min(1, (-t - 0.04) / 0.96)
        ctx.fillStyle = `rgba(255,107,107,${(i * 0.78 + 0.10) * alpha})`
      }
      ctx.fill()
    }

    // Coordinate axes
    const AX = 1.38, axCols = [C.vec1, C.vec2, C.vec3], axNames = ['x', 'y', 'z']
    for (let i = 0; i < 3; i++) {
      const tip = [0,0,0]; tip[i] = AX
      drawArrow(ctx, cx, cy, ...toSc(tip), axCols[i], 9)
      const lp = [0,0,0]; lp[i] = AX + 0.22
      const [lx, ly] = toSc(lp)
      ctx.fillStyle = axCols[i]; ctx.font = '12px var(--font-mono,monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(axNames[i], lx, ly)
    }
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    // ─ Colorbar ─
    const [eigMin, , eigMax] = eigenvalues3x3sym0(Q)
    const range = eigMax - eigMin
    if (range > 1e-8) {
      const barW = 13, barH = Math.min(H * 0.54, 200)
      const barX = W - 10 - barW
      const barY0 = (H - barH) / 2   // top = max eigenvalue (positive)
      const barY1 = barY0 + barH      // bottom = min eigenvalue (negative)
      const zeroFrac = eigMax / range  // fraction from top where f_Q = 0

      const grad = ctx.createLinearGradient(0, barY0, 0, barY1)
      grad.addColorStop(0, 'rgba(77,150,255,0.92)')
      grad.addColorStop(Math.max(0, Math.min(1, zeroFrac)), 'rgba(15,15,40,0.88)')
      grad.addColorStop(1, 'rgba(255,107,107,0.92)')
      ctx.fillStyle = grad
      ctx.fillRect(barX, barY0, barW, barH)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 0.5; ctx.strokeRect(barX, barY0, barW, barH)

      ctx.font = '9px var(--font-mono,monospace)'
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.textAlign = 'right'
      const tickX = barX - 2

      const drawTick = (y, label, baseline) => {
        ctx.beginPath(); ctx.moveTo(tickX, y); ctx.lineTo(barX, y)
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.textBaseline = baseline; ctx.fillText(label, tickX - 1, y)
      }
      drawTick(barY0, `+${eigMax.toFixed(2)}`, 'top')
      drawTick(barY0 + zeroFrac * barH, '0', 'middle')
      drawTick(barY1, eigMin.toFixed(2), 'bottom')
    }

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-sans,sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('fQ(u)=uᵀQu  · Drag to rotate', 12, H - 10)
  }

  // ── nD → 2D 투영 ──────────────────────────────────────────────────────────

  _drawND() {
    const { ctx, W, H, dim } = this
    if (!this._hullND || !this.orbitPts || !this.projection) return
    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.27
    const M = this.currentMatrix
    const P = this.projection
    const th = this.orbitTheta ?? -Math.PI / 4
    const ph = this.orbitPhi   ?? Math.PI / 6

    // nD → 3D: 현재 행렬 적용 후 투영
    const applyM  = v => M.map(row => row.reduce((s, c, k) => s + c * v[k], 0))
    const toWorld = v => project3(P, applyM(v))

    const R = buildOrbitMat(th, ph)
    const applyR = ([x,y,z]) => [
      R[0][0]*x+R[0][1]*y+R[0][2]*z,
      R[1][0]*x+R[1][1]*y+R[1][2]*z,
      R[2][0]*x+R[2][1]*y+R[2][2]*z,
    ]
    const proj2  = v => { const [rx,ry] = applyR(v); return [cx+rx*scale, cy-ry*scale] }
    const pdepth = v => applyR(v)[2]

    const { polygons, edges } = this._hullND
    const wPts = this.orbitPts.map(toWorld)
    const sPts = wPts.map(proj2)

    // 면 — 깊이 정렬 후 Painter's algorithm
    const sortedPolys = polygons
      .map((poly, idx) => ({
        poly, idx,
        depth: poly.verts.reduce((s,i)=>s+pdepth(wPts[i]),0)/poly.verts.length
      }))
      .sort((a,b) => a.depth - b.depth)

    for (const { poly, idx } of sortedPolys) {
      const fPts = poly.verts.map(i => sPts[i])
      ctx.beginPath(); ctx.moveTo(...fPts[0])
      fPts.slice(1).forEach(p => ctx.lineTo(...p))
      ctx.closePath()
      const mc = this.markedFaces.get(idx)
      ctx.fillStyle = mc ? PALETTE_FILLS[mc] : C.shape; ctx.fill()
      this._screenPolys.push({ idx, pts: fPts })
    }

    // 에지 — 깊이로 굵기 구분
    for (const { a, b } of edges) {
      const depth = (pdepth(wPts[a]) + pdepth(wPts[b])) / 2
      ctx.beginPath(); ctx.moveTo(...sPts[a]); ctx.lineTo(...sPts[b])
      ctx.strokeStyle = depth > 0 ? C.shapeLine : 'rgba(91,141,238,0.30)'
      ctx.lineWidth   = depth > 0 ? 1.4 : 0.7
      ctx.stroke()
    }

    ctx.fillStyle = C.text; ctx.font = '11px var(--font-sans,sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText(`${dim}D → 3D  [P] new projection`, 12, H - 10)
  }

  // ── Base vector widget (mini S² in left panel) ───────────────────────────

  setWidgetCanvas(canvas) {
    if (this._widgetHandlers) {
      const { el, onDown, onMove, onUp } = this._widgetHandlers
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      this._widgetHandlers = null
    }
    this._widgetCanvas = canvas
    if (!canvas) return

    let startX = 0, startY = 0, lastX = 0, lastY = 0, isDrag = false, mouseDown = false
    const onDown = e => {
      if (e.button !== 0) return
      startX = lastX = e.clientX; startY = lastY = e.clientY
      isDrag = false; mouseDown = true; e.preventDefault()
    }
    const onMove = e => {
      if (!mouseDown) return
      if (Math.hypot(e.clientX-startX, e.clientY-startY) > 3) isDrag = true
      if (isDrag) {
        this.orbitTheta += (e.clientX - lastX) * 0.008
        this.orbitPhi   += (e.clientY - lastY) * 0.008
        this.orbitPhi = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, this.orbitPhi))
      }
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = e => {
      if (mouseDown && !isDrag) this._handleBasePickWidget(e)
      mouseDown = false; isDrag = false
    }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    this._widgetHandlers = { el: canvas, onDown, onMove, onUp }
  }

  _handleBasePickWidget(e) {
    if (!this.onBaseVecPick || !this._widgetCanvas) return
    const canvas = this._widgetCanvas
    const { left, top } = canvas.getBoundingClientRect()
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.38
    const rx = (e.clientX - left - cx) / scale
    const ry = (cy - (e.clientY - top)) / scale
    const r2 = rx*rx + ry*ry
    let nx, ny, nz
    if (r2 > 1) {
      const len = Math.sqrt(r2); nx = rx/len; ny = ry/len; nz = 0
    } else {
      nx = rx; ny = ry; nz = Math.sqrt(1 - r2)
    }
    const R = buildOrbitMat(this.orbitTheta ?? -Math.PI/4, this.orbitPhi ?? Math.PI/6)
    this.onBaseVecPick([
      R[0][0]*nx + R[1][0]*ny + R[2][0]*nz,
      R[0][1]*nx + R[1][1]*ny + R[2][1]*nz,
      R[0][2]*nx + R[1][2]*ny + R[2][2]*nz,
    ])
  }

  _drawWidget() {
    const canvas = this._widgetCanvas
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (W === 0 || H === 0) return
    if (canvas.width !== Math.round(W*dpr) || canvas.height !== Math.round(H*dpr)) {
      canvas.width  = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    const ctx = canvas.getContext('2d')
    ctx.resetTransform(); ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const cx = W/2, cy = H/2
    const sc = Math.min(W, H) * 0.38
    const th = this.orbitTheta ?? -Math.PI/4
    const ph = this.orbitPhi   ??  Math.PI/6
    const R  = buildOrbitMat(th, ph)
    const applyR = ([x,y,z]) => [R[0][0]*x+R[0][1]*y+R[0][2]*z, R[1][0]*x+R[1][1]*y+R[1][2]*z, R[2][0]*x+R[2][1]*y+R[2][2]*z]
    const toSc   = v => { const [rx,ry] = applyR(v); return [cx+rx*sc, cy-ry*sc] }
    const dep    = v => applyR(v)[2]

    // Sphere background
    ctx.beginPath(); ctx.arc(cx, cy, sc, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(12,12,28,0.8)'; ctx.fill()
    ctx.strokeStyle = 'rgba(91,141,238,0.20)'; ctx.lineWidth = 1; ctx.stroke()

    // Grid lines
    ctx.strokeStyle = 'rgba(91,141,238,0.09)'; ctx.lineWidth = 0.6
    for (let ld = -60; ld <= 60; ld += 30) {
      const la = ld*Math.PI/180, rl = Math.cos(la), zl = Math.sin(la)
      ctx.beginPath(); let first = true
      for (let j = 0; j <= 60; j++) {
        const ln = j/60*2*Math.PI
        const [sx,sy] = toSc([rl*Math.cos(ln), rl*Math.sin(ln), zl])
        first ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy); first = false
      }
      ctx.stroke()
    }
    for (let ld = 0; ld < 180; ld += 30) {
      const ln = ld*Math.PI/180
      for (const sign of [1, -1]) {
        ctx.beginPath(); let first = true
        for (let j = 0; j <= 36; j++) {
          const la = j/36*Math.PI - Math.PI/2
          const [sx,sy] = toSc([sign*Math.cos(la)*Math.cos(ln), sign*Math.cos(la)*Math.sin(ln), Math.sin(la)])
          first ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy); first = false
        }
        ctx.stroke()
      }
    }

    // Coordinate axes
    const AX = 1.22
    const axRGB = [[255,107,107], [107,203,119], [77,150,255]]
    const axNames = ['x','y','z']
    for (let i = 0; i < 3; i++) {
      const tip = [0,0,0]; tip[i] = AX
      const d = dep(tip)
      const al = d > 0 ? 0.9 : 0.28
      const col = `rgba(${axRGB[i].join(',')},${al})`
      drawArrow(ctx, cx, cy, ...toSc(tip), col, 6)
      const lp = [0,0,0]; lp[i] = AX + 0.22
      const [lx,ly] = toSc(lp)
      ctx.fillStyle = col; ctx.font = '9px var(--font-mono,monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(axNames[i], lx, ly)
    }

    // Base vector
    const bv = this._widgetBaseVec
    if (bv) {
      const len = Math.hypot(...bv)
      if (len > 1e-9) {
        const vn = bv.map(x => x/len)
        const d  = dep(vn)
        const al = d > 0 ? 1.0 : 0.38
        const col = `rgba(255,220,80,${al})`
        const [sx, sy] = toSc(vn)
        drawArrow(ctx, cx, cy, sx, sy, col, 7)
        ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI*2)
        ctx.fillStyle = col; ctx.fill()
      }
    }
  }

  // ── 3D base vector pick (click → back-project to S²) ────────────────────

  _handleBasePick3D(e) {
    if (!this.onBaseVecPick) return
    const rect  = this.canvas.getBoundingClientRect()
    const px    = e.clientX - rect.left
    const py    = e.clientY - rect.top
    const cx    = this.W / 2, cy = this.H / 2
    const scale = Math.min(this.W, this.H) * 0.27
    const rx    = (px - cx) / scale
    const ry    = (cy - py) / scale    // y flip
    const r2    = rx * rx + ry * ry
    // Project onto front hemisphere; clamp to equator if click outside circle
    const nrm   = r2 > 1 ? Math.sqrt(r2) : 1
    const nx    = rx / nrm, ny = ry / nrm
    const nz    = r2 > 1 ? 0 : Math.sqrt(1 - r2)

    // Camera → world: apply R^T where R = buildOrbitMat(theta, phi)
    const R = buildOrbitMat(this.orbitTheta ?? -Math.PI / 4, this.orbitPhi ?? Math.PI / 6)
    const v = [
      R[0][0]*nx + R[1][0]*ny + R[2][0]*nz,
      R[0][1]*nx + R[1][1]*ny + R[2][1]*nz,
      R[0][2]*nx + R[1][2]*ny + R[2][2]*nz,
    ]
    this.onBaseVecPick(v)
  }

  // ── 면 클릭 감지 ─────────────────────────────────────────────────────────

  _handleFaceClick(e) {
    const rect = this.canvas.getBoundingClientRect()
    const px   = e.clientX - rect.left
    const py   = e.clientY - rect.top
    // 앞면 우선(뒤→앞 순으로 저장됐으므로 역순 탐색)
    for (let i = this._screenPolys.length - 1; i >= 0; i--) {
      const { idx, pts } = this._screenPolys[i]
      if (pointInPoly(px, py, pts)) {
        if (this.paletteIdx === 0) this.markedFaces.delete(idx)
        else                       this.markedFaces.set(idx, this.paletteIdx)
        return
      }
    }
  }

  _handleEdgeClick(e) {
    const rect  = this.canvas.getBoundingClientRect()
    const px    = e.clientX - rect.left
    const py    = e.clientY - rect.top
    let nearest = null, minDist = 12
    for (const edge of this._screenEdges) {
      const d = distToSegment(px, py, edge.a[0], edge.a[1], edge.b[0], edge.b[1])
      if (d < minDist) { minDist = d; nearest = edge }
    }
    if (!nearest) return
    if (this.paletteIdx === 0) this.markedEdges.delete(nearest.key)
    else                       this.markedEdges.set(nearest.key, this.paletteIdx)
  }

  // ── 궤도 카메라 ──────────────────────────────────────────────────────────

  _setupOrbit() {
    this._teardownOrbit()
    const canvas = this.canvas
    canvas.style.cursor = 'grab'
    let startX = 0, startY = 0, lastX = 0, lastY = 0, isDrag = false, mouseDown = false

    const onDown = e => {
      if (e.button !== 0) return
      startX = lastX = e.clientX; startY = lastY = e.clientY
      isDrag = false; mouseDown = true; canvas.style.cursor = 'grabbing'; e.preventDefault()
    }
    const onMove = e => {
      if (!mouseDown) return
      if (Math.hypot(e.clientX-startX, e.clientY-startY) > 3) isDrag = true
      if (isDrag) {
        this.orbitTheta += (e.clientX - lastX) * 0.008
        this.orbitPhi   += (e.clientY - lastY) * 0.008
        this.orbitPhi = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, this.orbitPhi))
      }
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = e => {
      if (mouseDown && !isDrag) {
        if      (this.vizMode === 'simplex4D') this._handleEdgeClick(e)
        else if (this.dim === 2)               this._handleFaceClick(e)
        // dim===3: widget handles base vector; dim>=4 other: no click action
      }
      isDrag = false; mouseDown = false; canvas.style.cursor = 'grab'
    }

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
    if (this._clickHandler) {
      this.canvas.removeEventListener('click', this._clickHandler)
      this._clickHandler = null
    }
    this.setWidgetCanvas(null)
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function buildPoly2D(pts) {
  const sorted = [...pts].sort((a,b) => Math.atan2(a[1],a[0]) - Math.atan2(b[1],b[0]))
  return { pts: sorted }
}

function drawArrow(ctx, x1, y1, x2, y2, color, hl) {
  const ang = Math.atan2(y2-y1, x2-x1)
  if (Math.hypot(x2-x1, y2-y1) < 1) return
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2)
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x2,y2)
  ctx.lineTo(x2 - hl*Math.cos(ang-Math.PI/7), y2 - hl*Math.sin(ang-Math.PI/7))
  ctx.lineTo(x2 - hl*Math.cos(ang+Math.PI/7), y2 - hl*Math.sin(ang+Math.PI/7))
  ctx.closePath(); ctx.fillStyle = color; ctx.fill()
}

function buildOrbitMat(theta, phi) {
  const cy=Math.cos(theta), sy=Math.sin(theta)
  const cp=Math.cos(phi),   sp=Math.sin(phi)
  return [
    [ cy,      0,   sy      ],
    [ sy*sp,  cp, -cy*sp   ],
    [-sy*cp,  sp,  cy*cp   ],
  ]
}

function fmtR(v) {
  const r = Math.round(v * 1000) / 1000
  return r === 0 ? '0' : r.toString()
}

export function matrixToString(M) {
  if (!M || M.length === 0) return ''
  if (M.length === 1 && M[0].length === 1) return fmtR(M[0][0])
  return M.map(row => '[' + row.map(v => fmtR(v).padStart(7)).join(', ') + ']').join('\n')
}
