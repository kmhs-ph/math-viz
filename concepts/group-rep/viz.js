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

// ── 랜덤 투영 (dim≥4 fallback) ──────────────────────────────────────────────

export function randomProjection(dim) {
  const dot  = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
  const scale = (a, k) => a.map(v => v * k)
  const sub   = (a, b) => a.map((v, i) => v - b[i])
  const rows  = [
    Array.from({ length: dim }, () => Math.random() - 0.5),
    Array.from({ length: dim }, () => Math.random() - 0.5),
  ]
  rows[0] = scale(rows[0], 1 / Math.sqrt(dot(rows[0], rows[0])))
  rows[1] = sub(rows[1], scale(rows[0], dot(rows[1], rows[0])))
  rows[1] = scale(rows[1], 1 / Math.sqrt(dot(rows[1], rows[1])))
  return rows
}

export function project(P, v) {
  return [
    P[0].reduce((s, p, i) => s + p * v[i], 0),
    P[1].reduce((s, p, i) => s + p * v[i], 0),
  ]
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
    this.orbitPts   = null
    this._poly2D    = null
    this._hull3D    = null
    this.projection = null

    this.markedFaces  = new Map()
    this.paletteIdx   = 0        // 0 = erase, 1-5 = color
    this._screenPolys = []

    this._rafId          = null
    this._clickHandler   = null
    this._orbitHandlers  = null
    this._loop           = this._loop.bind(this)
  }

  init(dim, orbitPts) {
    this.dim      = dim
    this.orbitPts = orbitPts
    this.markedFaces.clear()
    this._screenPolys = []

    if (dim === 2 && orbitPts) this._poly2D  = buildPoly2D(orbitPts)
    if (dim === 3 && orbitPts) this._hull3D  = buildHull3D(orbitPts)
    if (dim >= 4)               this.projection = randomProjection(dim)

    const I = identityR(dim)
    this.currentMatrix = I; this.startMatrix = I; this.targetMatrix = I
    this.animStart = null; this._animMode = 'linear'; this._geodesicFn = null

    // Click handler 설정
    if (this._clickHandler) {
      this.canvas.removeEventListener('click', this._clickHandler)
      this._clickHandler = null
    }
    if (dim === 2) {
      this._clickHandler = e => this._handleFaceClick(e)
      this.canvas.addEventListener('click', this._clickHandler)
    }

    if (dim === 3) {
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
    if (dim < 2) return

    const dStart  = dim === 2 ? det2(this.startMatrix)  : det3(this.startMatrix)
    const dTarget = dim === 2 ? det2(M)                  : det3(M)
    if (Math.abs(dStart - 1) > 0.01 || Math.abs(dTarget - 1) > 0.01) return

    const fn = dim === 2
      ? so2Geodesic(this.startMatrix, M)
      : so3Geodesic(this.startMatrix, M)
    if (fn) { this._animMode = 'geodesic'; this._geodesicFn = fn }
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
    this._screenPolys = []

    if      (this.dim === 1) this._draw1DR()
    else if (this.dim === 2) this._drawPoly2D()
    else if (this.dim === 3) this._drawPoly3D()
    else                     this._drawND()
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

    // 채워진 다각형 (면 마킹 색 적용)
    const mc2 = this.markedFaces.get(0)
    ctx.beginPath(); ctx.moveTo(...sPts[0])
    for (let i = 1; i < n; i++) ctx.lineTo(...sPts[i])
    ctx.closePath()
    ctx.fillStyle = mc2 ? PALETTE_FILLS[mc2] : C.shape; ctx.fill()
    this._screenPolys.push({ idx: 0, pts: sPts })

    // 에지
    for (let i = 0; i < n; i++) {
      const j = (i+1) % n
      ctx.beginPath(); ctx.moveTo(...sPts[i]); ctx.lineTo(...sPts[j])
      ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 1.5; ctx.stroke()
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

  // ── nD → 2D 투영 ──────────────────────────────────────────────────────────

  _drawND() {
    const { ctx, W, H, dim, projection: P } = this
    if (!P) return
    const cx = W/2, cy = H/2
    const unit = Math.min(W,H) * 0.14
    const M = this.currentMatrix
    const applyM = v => v.map((_,i) => M[i].reduce((s,m,j)=>s+m*v[j],0))
    const projBases = Array.from({length:dim},(_,j)=>{
      const ej=Array(dim).fill(0); ej[j]=1; return project(P, applyM(ej))
    })
    const toSc = ([x,y]) => [cx+x*unit, cy-y*unit]
    const b1=projBases[0], b2=projBases[1]||[0,0]
    const RANGE=3
    for (let i=-RANGE;i<=RANGE;i++) {
      ctx.beginPath()
      ctx.moveTo(...toSc([i*b1[0]+(-RANGE)*b2[0], i*b1[1]+(-RANGE)*b2[1]]))
      ctx.lineTo(...toSc([i*b1[0]+RANGE*b2[0], i*b1[1]+RANGE*b2[1]]))
      ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1; ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(...toSc([(-RANGE)*b1[0]+i*b2[0], (-RANGE)*b1[1]+i*b2[1]]))
      ctx.lineTo(...toSc([RANGE*b1[0]+i*b2[0], RANGE*b1[1]+i*b2[1]]))
      ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1; ctx.stroke()
    }
    const cols=[C.vec1,C.vec2,C.vec3,'#e0c05c','#c05ce0']
    projBases.forEach((b,j)=>{ const[bx,by]=toSc(b); drawArrow(ctx,cx,cy,bx,by,cols[j%cols.length],8) })
    ctx.fillStyle=C.text; ctx.font='11px var(--font-mono,monospace)'
    ctx.textAlign='right'; ctx.fillText(`${dim}D → 2D projection`, W-12, H-10)
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
      if (mouseDown && !isDrag) this._handleFaceClick(e)
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
