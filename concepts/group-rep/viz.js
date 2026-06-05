import { resizeCanvas } from '../../shared/canvas-utils.js'

// ── 색상 상수 ───────────────────────────────────────────────────────────────
const C = {
  bg:       '#0d0f14',
  grid:     'rgba(255,255,255,0.07)',
  axis:     'rgba(255,255,255,0.18)',
  vec1:     '#e05c5c',   // e₁ (빨강)
  vec2:     '#5c9de0',   // e₂ (파랑)
  shape:    'rgba(91,141,238,0.25)',
  shapeLine:'rgba(91,141,238,0.7)',
  unit:     'rgba(255,255,255,0.12)',
  dot:      '#ffffff',
  accent:   '#5b8dee',
  accentHi: '#7aa5f5',
  text:     'rgba(255,255,255,0.45)',
}

// ── 보간 ────────────────────────────────────────────────────────────────────

function smoothstep(t) { return t * t * (3 - 2 * t) }

function lerpMat(A, B, t) {
  return A.map((row, i) => row.map((v, j) => v + (B[i][j] - v) * t))
}

function lerpMatC(A, B, t) {
  return A.map((row, i) =>
    row.map((v, j) => ({
      re: v.re + (B[i][j].re - v.re) * t,
      im: v.im + (B[i][j].im - v.im) * t,
    }))
  )
}

function identityR(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )
}

function identityC(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 }))
  )
}

// ── 2D 투영 (고차원용) ──────────────────────────────────────────────────────

export function randomProjection(dim) {
  // 정규화된 2행 랜덤 행렬 (2×dim)
  const rows = [
    Array.from({ length: dim }, () => (Math.random() - 0.5)),
    Array.from({ length: dim }, () => (Math.random() - 0.5)),
  ]
  // Gram-Schmidt 정규화
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
  const scale = (a, k) => a.map(v => v * k)
  const sub = (a, b) => a.map((v, i) => v - b[i])
  const norm = a => Math.sqrt(dot(a, a))

  rows[0] = scale(rows[0], 1 / norm(rows[0]))
  rows[1] = sub(rows[1], scale(rows[0], dot(rows[1], rows[0])))
  rows[1] = scale(rows[1], 1 / norm(rows[1]))
  return rows   // [[row0...], [row1...]]
}

export function project(P, v) {
  // P: 2×dim, v: dim-vector → 2-vector
  return [
    P[0].reduce((s, p, i) => s + p * v[i], 0),
    P[1].reduce((s, p, i) => s + p * v[i], 0),
  ]
}

// ── Visualizer 클래스 ────────────────────────────────────────────────────────

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.W = 0; this.H = 0

    // 애니메이션 상태
    this.targetMatrix = null   // ρ(g) — 목표 행렬
    this.currentMatrix = null  // 현재 보간 중인 행렬
    this.animStart = null
    this.animDuration = 450    // ms

    this.field = 'R'
    this.dim = 1
    this.projection = null     // dim ≥ 3 일 때 랜덤 투영

    this._rafId = null
    this._loop = this._loop.bind(this)
  }

  init(field, dim) {
    this.field = field
    this.dim = dim
    this.projection = (dim >= 3) ? randomProjection(dim) : null
    const I = field === 'R' ? identityR(dim) : identityC(dim)
    this.currentMatrix = I
    this.startMatrix  = I
    this.targetMatrix = I
    this.animStart = null
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
    this.startMatrix = this.currentMatrix  // 현재 상태에서 출발
    this.animStart = performance.now()
    this.targetMatrix = M
  }

  reset() {
    const I = this.field === 'R' ? identityR(this.dim) : identityC(this.dim)
    this.setTarget(I)
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
    const elapsed = ts - this.animStart
    const t = Math.min(elapsed / this.animDuration, 1)
    const e = smoothstep(t)

    if (this.field === 'R') {
      this.currentMatrix = lerpMat(this.startMatrix, this.targetMatrix, e)
    } else {
      this.currentMatrix = lerpMatC(this.startMatrix, this.targetMatrix, e)
    }

    if (t >= 1) this.animStart = null
  }

  _draw() {
    const { ctx, W, H, field, dim } = this
    ctx.clearRect(0, 0, W, H)

    if (dim === 1 && field === 'R') this._draw1DR()
    else if (dim === 1 && field === 'C') this._draw1DC()
    else if (dim === 2) this._draw2D()
    else if (dim === 3) this._draw3D()
    else this._drawND()
  }

  // ── 1D 실수 ────────────────────────────────────────────────────────────

  _draw1DR() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const scale = W * 0.25

    // 수직선
    ctx.beginPath()
    ctx.moveTo(cx - scale * 1.6, cy)
    ctx.lineTo(cx + scale * 1.6, cy)
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5; ctx.stroke()

    // 눈금 -1, 0, +1
    for (const v of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + v * scale, cy - 6)
      ctx.lineTo(cx + v * scale, cy + 6)
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.stroke()

      ctx.fillStyle = C.text; ctx.font = `12px var(--font-mono, monospace)`
      ctx.textAlign = 'center'
      ctx.fillText(v, cx + v * scale, cy + 20)
    }

    // 현재 값: ρ(g)·1
    const val = this.currentMatrix[0][0]   // 1×1 행렬
    const dotX = cx + val * scale

    // 기준 벡터 (반투명)
    drawArrow(ctx, cx, cy, cx + scale, cy, C.vec1 + '60', 8)

    // 변환된 벡터
    drawArrow(ctx, cx, cy, dotX, cy, C.vec1, 10)

    // 값 텍스트
    ctx.fillStyle = C.accentHi; ctx.font = `14px var(--font-mono, monospace)`
    ctx.textAlign = 'center'
    ctx.fillText(formatReal(val), dotX, cy - 24)
  }

  // ── 1D 복소 ────────────────────────────────────────────────────────────

  _draw1DC() {
    const { ctx, W, H } = this
    const cx = W / 2, cy = H / 2
    const r = Math.min(W, H) * 0.34

    // 단위원
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = C.unit; ctx.lineWidth = 1.5; ctx.stroke()

    // 축
    ctx.beginPath()
    ctx.moveTo(cx - r * 1.15, cy); ctx.lineTo(cx + r * 1.15, cy)
    ctx.moveTo(cx, cy - r * 1.15); ctx.lineTo(cx, cy + r * 1.15)
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.stroke()

    // 라벨
    ctx.fillStyle = C.text; ctx.font = '12px var(--font-mono, monospace)'
    ctx.textAlign = 'center'
    ctx.fillText('Re', cx + r * 1.15 + 14, cy + 4)
    ctx.fillText('Im', cx + 4, cy - r * 1.15 - 8)

    // 기준 벡터 (반투명)
    drawArrow(ctx, cx, cy, cx + r, cy, C.vec1 + '50', 8)

    // 변환된 벡터
    const z = this.currentMatrix[0][0]
    const px = cx + z.re * r, py = cy - z.im * r
    drawArrow(ctx, cx, cy, px, py, C.vec1, 10)

    // 각도 호: theta = 캔버스 기준 화살표 각도 (y축 반전)
    const theta = Math.atan2(-z.im, z.re)
    if (Math.abs(theta) > 0.02) {
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, theta, theta < 0)
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // 값 텍스트
    ctx.fillStyle = C.accentHi; ctx.font = '13px var(--font-mono, monospace)'
    ctx.textAlign = 'left'
    ctx.fillText(formatComplex(z), cx + r * 1.15 + 4, cy - 14)
  }

  // ── 2D ─────────────────────────────────────────────────────────────────

  _draw2D() {
    const { ctx, W, H, field } = this
    const cx = W / 2, cy = H / 2
    const unit = Math.min(W, H) * 0.16

    // 현재 행렬에서 기저 벡터 추출
    const M = this.currentMatrix
    const getCol = j => field === 'R'
      ? [M[0][j], M[1][j]]
      : [M[0][j].re, M[1][j].re]   // 복소인 경우 실부만 표시

    const b1 = getCol(0)
    const b2 = getCol(1)

    // to screen
    const toSc = ([x, y]) => [cx + x * unit, cy - y * unit]

    // 격자선
    const RANGE = 4
    for (let i = -RANGE; i <= RANGE; i++) {
      ctx.beginPath()
      const [x0, y0] = toSc([i * b1[0] + (-RANGE) * b2[0], i * b1[1] + (-RANGE) * b2[1]])
      const [x1, y1] = toSc([i * b1[0] + RANGE * b2[0], i * b1[1] + RANGE * b2[1]])
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke()

      const [x2, y2] = toSc([(-RANGE) * b1[0] + i * b2[0], (-RANGE) * b1[1] + i * b2[1]])
      const [x3, y3] = toSc([RANGE * b1[0] + i * b2[0], RANGE * b1[1] + i * b2[1]])
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke()
    }

    // 방향 표식: 'F' 모양 (비대칭, 반사 여부를 즉시 알 수 있음)
    drawUnitSquare(ctx, cx, cy, b1, b2, unit, toSc)

    // 기저벡터 화살표
    const [b1x, b1y] = toSc(b1)
    const [b2x, b2y] = toSc(b2)
    drawArrow(ctx, cx, cy, b1x, b1y, C.vec1, 10)
    drawArrow(ctx, cx, cy, b2x, b2y, C.vec2, 10)

    // 레이블
    ctx.font = '13px var(--font-mono, monospace)'; ctx.textAlign = 'center'
    ctx.fillStyle = C.vec1; ctx.fillText('e₁', b1x + (b1x - cx) * 0.18, b1y + (b1y - cy) * 0.18)
    ctx.fillStyle = C.vec2; ctx.fillText('e₂', b2x + (b2x - cx) * 0.18, b2y + (b2y - cy) * 0.18)
  }

  // ── nD 투영 ─────────────────────────────────────────────────────────────

  _drawND() {
    const { ctx, W, H, field, dim, projection: P } = this
    if (!P) return
    const cx = W / 2, cy = H / 2
    const unit = Math.min(W, H) * 0.14

    const M = this.currentMatrix
    const applyM = v => {
      if (field === 'R') {
        return v.map((_, i) => M[i].reduce((s, m, j) => s + m * v[j], 0))
      } else {
        return v.map((_, i) => M[i].reduce((s, m, j) => s + m.re * v[j], 0))
      }
    }

    // 투영된 기저벡터
    const projBases = Array.from({ length: dim }, (_, j) => {
      const ej = Array(dim).fill(0); ej[j] = 1
      const Mej = applyM(ej)
      return project(P, Mej)
    })

    const toSc = ([x, y]) => [cx + x * unit, cy - y * unit]

    // 투영된 격자선 (첫 두 기저벡터만 사용)
    const b1 = projBases[0], b2 = projBases[1] || [0, 0]
    const RANGE = 3
    for (let i = -RANGE; i <= RANGE; i++) {
      ctx.beginPath()
      const [x0, y0] = toSc([i * b1[0] + (-RANGE) * b2[0], i * b1[1] + (-RANGE) * b2[1]])
      const [x1, y1] = toSc([i * b1[0] + RANGE * b2[0], i * b1[1] + RANGE * b2[1]])
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke()

      ctx.beginPath()
      const [x2, y2] = toSc([(-RANGE) * b1[0] + i * b2[0], (-RANGE) * b1[1] + i * b2[1]])
      const [x3, y3] = toSc([RANGE * b1[0] + i * b2[0], RANGE * b1[1] + i * b2[1]])
      ctx.moveTo(x2, y2); ctx.lineTo(x3, y3)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke()
    }

    drawUnitSquare(ctx, cx, cy, b1, b2, unit, toSc)

    // 기저벡터들 화살표 (희미하게)
    const colors = [C.vec1, C.vec2, '#5ce05c', '#e0c05c', '#c05ce0']
    projBases.forEach((b, j) => {
      const [bx, by] = toSc(b)
      drawArrow(ctx, cx, cy, bx, by, colors[j % colors.length], 8)
    })

    // 투영 안내
    ctx.fillStyle = C.text; ctx.font = '11px var(--font-mono, monospace)'
    ctx.textAlign = 'right'
    ctx.fillText(`${dim}D → 2D 투영`, W - 12, H - 10)
  }

  // ── 3D 궤도 카메라 ──────────────────────────────────────────────────────

  _draw3D() {
    const { ctx, W, H, field } = this
    const cx = W / 2, cy = H / 2
    const scale = Math.min(W, H) * 0.22
    const M = this.currentMatrix
    const theta = this.orbitTheta ?? Math.PI / 4
    const phi   = this.orbitPhi   ?? Math.PI / 6

    const getM = (i, j) => field === 'R' ? M[i][j] : M[i][j].re
    const applyM = ([x, y, z]) => [
      getM(0,0)*x + getM(0,1)*y + getM(0,2)*z,
      getM(1,0)*x + getM(1,1)*y + getM(1,2)*z,
      getM(2,0)*x + getM(2,1)*y + getM(2,2)*z,
    ]

    const R = buildOrbitMatrix(theta, phi)
    const applyR = ([x, y, z]) => [
      R[0][0]*x + R[0][1]*y + R[0][2]*z,
      R[1][0]*x + R[1][1]*y + R[1][2]*z,
      R[2][0]*x + R[2][1]*y + R[2][2]*z,
    ]
    // 직교 투영: orbit 회전 후 x,y 성분만 사용
    const proj   = v => { const [rx, ry] = applyR(v); return [cx + rx * scale, cy - ry * scale] }
    const pdepth = v => applyR(v)[2]

    // ── 고정 좌표축 (group action 없음) ──────────────────────────────────
    const AX_LEN  = 1.6
    const axCols  = [C.vec1, C.vec2, '#5ce05c']
    const axNames = ['x', 'y', 'z']
    for (let i = 0; i < 3; i++) {
      const tip = [0, 0, 0]; tip[i] = AX_LEN
      const [sx, sy] = proj(tip)
      drawArrow(ctx, cx, cy, sx, sy, axCols[i], 9)
      const lblPt = [0, 0, 0]; lblPt[i] = AX_LEN + 0.22
      const [lx, ly] = proj(lblPt)
      ctx.fillStyle = axCols[i]
      ctx.font = '12px var(--font-mono, monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(axNames[i], lx, ly)
    }

    // 원점
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

    // ── 큐브 (group action 적용 후 orbit 투영) ───────────────────────────
    const CS = 0.9
    const VERTS = [
      [-CS,-CS,-CS], [CS,-CS,-CS], [CS,CS,-CS], [-CS,CS,-CS],
      [-CS,-CS, CS], [CS,-CS, CS], [CS,CS, CS], [-CS,CS, CS],
    ]
    const FACES = [
      [0,1,2,3], [4,5,6,7],
      [0,1,5,4], [2,3,7,6],
      [0,3,7,4], [1,2,6,5],
    ]

    const wverts = VERTS.map(applyM)
    const sverts = wverts.map(proj)

    FACES.map(idx => ({
      idx,
      depth: idx.reduce((s, i) => s + pdepth(wverts[i]), 0) / idx.length,
    })).sort((a, b) => a.depth - b.depth)
    .forEach(({ idx }) => {
      const pts = idx.map(i => sverts[i])
      ctx.beginPath(); ctx.moveTo(...pts[0])
      pts.slice(1).forEach(p => ctx.lineTo(...p))
      ctx.closePath()
      ctx.fillStyle = 'rgba(91,141,238,0.12)'; ctx.fill()
      ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 1.2; ctx.stroke()
    })

    ctx.fillStyle = C.text
    ctx.font = '11px var(--font-sans, sans-serif)'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('드래그로 회전', 12, H - 10)
  }

  // ── 미니 카드용 그리기 ───────────────────────────────────────────────────

  drawMini(canvas, targetMatrix, field, dim) {
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const cx = W / 2, cy = H / 2

    if (dim === 1 && field === 'R') {
      const val = typeof targetMatrix[0][0] === 'number'
        ? targetMatrix[0][0] : targetMatrix[0][0].re
      ctx.fillStyle = C.accentHi; ctx.font = 'bold 16px var(--font-mono, monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(formatReal(val), cx, cy)
    } else if (dim === 1 && field === 'C') {
      const z = targetMatrix[0][0]
      ctx.fillStyle = C.accentHi; ctx.font = '12px var(--font-mono, monospace)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(formatComplex(z), cx, cy)
    } else if (dim === 3) {
      const scale = Math.min(W, H) * 0.1
      const SQ3_2 = Math.sqrt(3) / 2
      const get = (i, j) => field === 'R' ? targetMatrix[i][j] : targetMatrix[i][j].re
      const applyM = ([x, y, z]) => [
        get(0,0)*x+get(0,1)*y+get(0,2)*z,
        get(1,0)*x+get(1,1)*y+get(1,2)*z,
        get(2,0)*x+get(2,1)*y+get(2,2)*z,
      ]
      const iso = ([x, y, z]) => [cx + (x-z)*SQ3_2*scale, cy + ((x+z)*0.5-y)*scale]
      const CS = 0.9
      const CV = [
        [-CS,-CS,-CS],[CS,-CS,-CS],[CS,CS,-CS],[-CS,CS,-CS],
        [-CS,-CS,CS],[CS,-CS,CS],[CS,CS,CS],[-CS,CS,CS],
      ]
      const FACES = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,3,7,4],[1,2,6,5]]
      const tverts = CV.map(applyM)
      const sverts = tverts.map(iso)
      const sorted = FACES.map(idx => ({
        idx,
        depth: idx.reduce((s, i) => s + tverts[i][0]+tverts[i][1]+tverts[i][2], 0) / idx.length,
      })).sort((a, b) => a.depth - b.depth)
      for (const { idx } of sorted) {
        const pts = idx.map(i => sverts[i])
        ctx.beginPath(); ctx.moveTo(...pts[0])
        pts.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath()
        ctx.fillStyle = 'rgba(91,141,238,0.1)'; ctx.fill()
        ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 0.7; ctx.stroke()
      }
    } else {
      // 2D 미니 격자
      const unit = Math.min(W, H) * 0.12
      const getCol = j => field === 'R'
        ? [targetMatrix[0][j], targetMatrix[1][j]]
        : [targetMatrix[0][j].re, targetMatrix[1][j].re]
      const b1 = getCol(0), b2 = getCol(1)
      const toSc = ([x, y]) => [cx + x * unit, cy - y * unit]
      const RANGE = 3
      for (let i = -RANGE; i <= RANGE; i++) {
        ctx.beginPath()
        ctx.moveTo(...toSc([i * b1[0] + (-RANGE) * b2[0], i * b1[1] + (-RANGE) * b2[1]]))
        ctx.lineTo(...toSc([i * b1[0] + RANGE * b2[0], i * b1[1] + RANGE * b2[1]]))
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.8; ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(...toSc([(-RANGE) * b1[0] + i * b2[0], (-RANGE) * b1[1] + i * b2[1]]))
        ctx.lineTo(...toSc([RANGE * b1[0] + i * b2[0], RANGE * b1[1] + i * b2[1]]))
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.8; ctx.stroke()
      }
      const [b1x, b1y] = toSc(b1); const [b2x, b2y] = toSc(b2)
      drawArrow(ctx, cx, cy, b1x, b1y, C.vec1, 5)
      drawArrow(ctx, cx, cy, b2x, b2y, C.vec2, 5)
    }
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._teardownOrbit()
  }

  _setupOrbit() {
    this._teardownOrbit()
    const canvas = this.canvas
    canvas.style.cursor = 'grab'
    let dragging = false, lastX = 0, lastY = 0
    const onDown = e => {
      if (e.button !== 0) return
      dragging = true; lastX = e.clientX; lastY = e.clientY
      canvas.style.cursor = 'grabbing'
      e.preventDefault()
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
}

// ── 헬퍼 함수 ───────────────────────────────────────────────────────────────

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

// 단위 정사각형: 3D 큐브와 동일한 방식으로 기저 벡터 기준 ±CS 범위
function drawUnitSquare(ctx, cx, cy, b1, b2, unit, toSc) {
  const CS = 0.9
  const corners = [[-CS, -CS], [CS, -CS], [CS, CS], [-CS, CS]]
  const toWorld = ([u, v]) => [
    u * b1[0] + v * b2[0],
    u * b1[1] + v * b2[1],
  ]
  const screenPts = corners.map(p => toSc(toWorld(p)))
  ctx.beginPath()
  ctx.moveTo(...screenPts[0])
  screenPts.slice(1).forEach(p => ctx.lineTo(...p))
  ctx.closePath()
  ctx.fillStyle = C.shape; ctx.fill()
  ctx.strokeStyle = C.shapeLine; ctx.lineWidth = 1.5; ctx.stroke()
}

// 행렬을 보기 좋게 문자열로
export function matrixToString(M, field) {
  if (!M || M.length === 0) return ''
  if (M.length === 1 && M[0].length === 1) {
    return field === 'R' ? formatReal(M[0][0]) : formatComplex(M[0][0])
  }
  const rows = M.map(row =>
    '[' + row.map(v => field === 'R'
      ? formatReal(v).padStart(7)
      : formatComplex(v).padStart(14)
    ).join(', ') + ']'
  )
  return rows.join('\n')
}

function formatReal(v) {
  const r = Math.round(v * 1000) / 1000
  return r === 0 ? '0' : r.toString()
}

function formatComplex(z) {
  if (!z || typeof z === 'number') return formatReal(z || 0)
  const re = Math.round(z.re * 100) / 100
  const im = Math.round(z.im * 100) / 100
  if (im === 0) return formatReal(re)
  if (re === 0) return im === 1 ? 'i' : im === -1 ? '-i' : `${im}i`
  const imStr = im === 1 ? '+i' : im === -1 ? '-i' : im > 0 ? `+${im}i` : `${im}i`
  return `${re}${imStr}`
}

// orbit 회전 행렬: R_x(phi) * R_y(theta)
function buildOrbitMatrix(theta, phi) {
  const cy = Math.cos(theta), sy = Math.sin(theta)
  const cp = Math.cos(phi),   sp = Math.sin(phi)
  return [
    [ cy,       0,   sy      ],
    [ sy * sp,  cp, -cy * sp ],
    [-sy * cp,  sp,  cy * cp ],
  ]
}
