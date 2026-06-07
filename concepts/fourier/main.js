import { createSlider, createSelect, addDivider } from '../../shared/controls.js'

const WF = {
  square: {
    label: 'Square wave',
    a: _n => 0,
    b: n => n % 2 ? 4 / (n * Math.PI) : 0,
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return x < Math.PI ? 1 : -1
    },
  },
  sawtooth: {
    label: 'Sawtooth wave',
    a: _n => 0,
    b: n => 2 * Math.pow(-1, n+1) / (n * Math.PI),
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return x < Math.PI ? x / Math.PI : (x - 2*Math.PI) / Math.PI
    },
  },
  triangle: {
    label: 'Triangle wave',
    a: _n => 0,
    b: n => n % 2 ? 8 * Math.pow(-1, (n-1)/2) / (n*n*Math.PI*Math.PI) : 0,
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      if (x < Math.PI/2)   return 2*x/Math.PI
      if (x < 3*Math.PI/2) return 2 - 2*x/Math.PI
      return 2*x/Math.PI - 4
    },
  },
  dirac: {
    label: 'Dirac delta',
    a: _n => 0,
    b: _n => 2 / Math.PI,
    exact: null,
  },
}

const KN = {
  identity: {
    label: 'Identity',
    formula: 'K̂(n) = 1',
    coeff: (_n, _p, _N) => 1,
    param: null,
  },
  heat: {
    label: 'Heat',
    formula: 'K̂(n) = e⁻ⁿ²ᵗ',
    coeff: (n, t) => Math.exp(-n * n * t),
    param: { label: 't', min: 0.01, max: 2, step: 0.01, def: 0.3 },
  },
  poisson: {
    label: 'Poisson',
    formula: 'K̂(n) = rⁿ',
    coeff: (n, r) => Math.pow(r, n),
    param: { label: 'r', min: 0.05, max: 0.98, step: 0.01, def: 0.7 },
  },
  fejer: {
    label: 'Fejér',
    formula: 'K̂(n) = 1−n/N',
    coeff: (n, _p, N) => n < N ? 1 - n/N : 0,
    param: null,
  },
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  wf: 'square', kn: 'identity', N: 20, param: 1,
  a: [],     // cosine coefficients (user-editable)
  b: [],     // sine coefficients (user-editable)
  aBase: [], // preset values used for stable y-scale
  bBase: [],
}

function resetCoeffs() {
  const wf = WF[state.wf], N = state.N
  state.aBase = Array.from({length: N}, (_, i) => wf.a(i+1))
  state.bBase = Array.from({length: N}, (_, i) => wf.b(i+1))
  state.a = [...state.aBase]
  state.b = [...state.bBase]
}

function resizeCoeffs(oldN) {
  const wf = WF[state.wf], N = state.N
  if (N > oldN) {
    for (let n = oldN + 1; n <= N; n++) {
      state.aBase.push(wf.a(n)); state.a.push(wf.a(n))
      state.bBase.push(wf.b(n)); state.b.push(wf.b(n))
    }
  } else {
    state.aBase.length = N; state.a.length = N
    state.bBase.length = N; state.b.length = N
  }
}

let hoverKn = null

const anim = {
  active: false,
  fromKn: 'identity', fromParam: 1,
  toKn:   'identity', toParam:   1,
  t: 1, startTime: null, dur: 520,
}

function knCoeff(n, N) {
  if (!anim.active) return KN[state.kn].coeff(n, state.param, N)
  const a = KN[anim.fromKn].coeff(n, anim.fromParam, N)
  const b = KN[anim.toKn].coeff(n, anim.toParam, N)
  return a + (b - a) * anim.t
}

function kernelParamFor(knKey) {
  if (knKey === state.kn) return state.param
  return KN[knKey].param?.def ?? 0
}

function triggerAnim(newKnKey) {
  anim.fromKn    = state.kn
  anim.fromParam = state.param
  state.kn = newKnKey
  const p = KN[newKnKey].param
  if (p) state.param = p.def
  anim.toKn    = state.kn
  anim.toParam = state.param
  anim.t = 0; anim.startTime = null; anim.active = true
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const CVR  = document.getElementById('canvas-r')
const CVBL = document.getElementById('canvas-bl')

function prep(cv) {
  const dpr = window.devicePixelRatio || 1
  const r = cv.parentElement.getBoundingClientRect()
  const W = r.width, H = r.height
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)) {
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr)
    const c = cv.getContext('2d')
    c.resetTransform(); c.scale(dpr, dpr)
  }
  return [cv.getContext('2d'), W, H]
}

const PL = 10, PR = 10

// ── Drag state & layout ───────────────────────────────────────────────────────
let drag = null  // { zone, n, yMin, yMax, barTop, barH }
const blLayout = { a: {}, b: {} }

function hitBL(e) {
  const rect = CVBL.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  for (const zone of ['a', 'b']) {
    const z = blLayout[zone]
    if (!z.barH) continue
    if (cy < z.barTop - 6 || cy > z.barTop + z.barH + 6) continue
    const step = (z.W - PL - PR) / z.N
    const n = Math.floor((cx - PL) / step) + 1
    if (n >= 1 && n <= z.N) return { zone, n, z }
  }
  return null
}

CVBL.addEventListener('mousedown', e => {
  const hit = hitBL(e)
  if (!hit) return
  const { zone, n, z } = hit
  drag = { zone, n, yMin: z.yMin, yMax: z.yMax, barTop: z.barTop, barH: z.barH }
  anim.active = false
  CVBL.style.cursor = 'ns-resize'
  applyDrag(e)
  e.preventDefault()
})

window.addEventListener('mousemove', e => {
  if (drag) { applyDrag(e); return }
  const hit = hitBL(e)
  CVBL.style.cursor = hit ? 'ns-resize' : 'default'
})

window.addEventListener('mouseup', () => { drag = null })

CVBL.addEventListener('mouseleave', () => { if (!drag) CVBL.style.cursor = 'default' })

function applyDrag(e) {
  if (!drag) return
  const rect = CVBL.getBoundingClientRect()
  const cy = e.clientY - rect.top
  const { zone, n, yMin, yMax, barTop, barH } = drag
  const val = yMin + (1 - (cy - barTop) / barH) * (yMax - yMin)
  if (zone === 'a') state.a[n-1] = val
  else              state.b[n-1] = val
  render()
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function panelTitle(ctx, text) {
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '11px Inter, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, PL, 15)
  ctx.restore()
}

function hline(ctx, W, y) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke()
  ctx.restore()
}

function drawLineCurve(ctx, W, H, vals, yMin, yMax, col, lw) {
  const PT = 30, PB = 22
  const cW = W - PL - PR, cH = H - PT - PB
  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH
  ctx.save()
  ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = lw
  vals.forEach((v, i) => {
    const x = PL + (i / (vals.length - 1)) * cW
    i === 0 ? ctx.moveTo(x, yOf(v)) : ctx.lineTo(x, yOf(v))
  })
  ctx.stroke(); ctx.restore()
  return yOf
}

// ── Zone renderer (shared for a-zone and b-zone) ──────────────────────────────
function drawZone(ctx, W, zTop, zH, vals, baseMax, col, label, zoneName) {
  const PT_z = 18, PB_z = 20
  const barTop = zTop + PT_z
  const barH   = zH - PT_z - PB_z
  const N = vals.length

  // Stable y-scale: based on preset baseMax, with 2x headroom for dragging
  const yMax =  baseMax * 2
  const yMin = -baseMax * 2
  const yOf  = v => barTop + (1 - (v - yMin) / (yMax - yMin)) * barH
  const y0   = yOf(0)

  // Save layout for drag hit-test
  blLayout[zoneName] = { zTop, zH, barTop, barH, yMin, yMax, N, W }

  const step = (W - PL - PR) / N
  const barW = Math.max(1.5, step - 2)

  // Bars
  ctx.save()
  for (let i = 0; i < N; i++) {
    const v  = vals[i]
    const bx = PL + (i + 0.5) * step - barW / 2
    ctx.globalAlpha = 0.85
    ctx.fillStyle   = v >= 0 ? col : '#e05c5c'
    ctx.fillRect(bx, Math.min(yOf(v), y0), barW, Math.abs(yOf(v) - y0))
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // Zero line
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke()
  ctx.restore()

  // Zone label
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '10px Inter, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, PL, zTop + PT_z / 2)
  ctx.restore()

  // n-axis ticks
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '9px "JetBrains Mono",monospace'
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'
  for (const n of [...new Set([1, Math.ceil(N/2), N])]) {
    ctx.fillText(n, PL + (n - 0.5) * step, barTop + barH + 3)
  }
  ctx.restore()

  // K̂ hover preview — smooth curve showing where bars WOULD land after kernel
  if (hoverKn && hoverKn !== state.kn) {
    const anyNonZero = vals.some(v => Math.abs(v) > 1e-9)
    if (anyNonZero) {
      const SAMP = Math.max(80, N * 20)
      const param = kernelParamFor(hoverKn)
      ctx.save()
      ctx.strokeStyle = 'rgba(92,224,92,0.55)'; ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i <= SAMP; i++) {
        const n  = 1 + (N - 1) * i / SAMP
        const n0 = Math.max(0, Math.min(N-1, Math.floor(n) - 1))
        const n1 = Math.max(0, Math.min(N-1, Math.ceil(n)  - 1))
        const t  = n - Math.floor(n)
        const ref  = (1 - t) * vals[n0] + t * vals[n1]
        const kval = KN[hoverKn].coeff(n, param, N)
        const x = PL + (n - 0.5) * step
        const y = yOf(kval * ref)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke(); ctx.restore()
    }
  }
}

// ── Panel renderers ───────────────────────────────────────────────────────────
function renderBL() {
  const [ctx, W, H] = prep(CVBL)
  ctx.clearRect(0, 0, W, H)

  const GAP = 5
  const aH   = Math.floor((H - GAP) / 2)
  const bTop = aH + GAP
  const bH   = H - bTop

  const aBaseMax = Math.max(0.5, ...state.aBase.map(Math.abs))
  const bBaseMax = Math.max(0.5, ...state.bBase.map(Math.abs))

  drawZone(ctx, W, 0,    aH, state.a, aBaseMax, '#e8a030', 'aₙ  —  cosine', 'a')
  drawZone(ctx, W, bTop, bH, state.b, bBaseMax, '#5b8dee', 'bₙ  —  sine',   'b')

  // Divider
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, aH + 2); ctx.lineTo(W, aH + 2); ctx.stroke()
  ctx.restore()
}

function renderR() {
  const [ctx, W, H] = prep(CVR)
  ctx.clearRect(0, 0, W, H)

  const wf = WF[state.wf], N = state.N, M = 600
  const PT = 30, PB = 22

  const exactVals = wf.exact
    ? Array.from({length: M+1}, (_, i) => wf.exact(2*Math.PI*i/M))
    : null

  const outVals = Array.from({length: M+1}, (_, i) => {
    const th = 2*Math.PI*i/M
    let s = 0
    for (let n = 1; n <= N; n++) {
      const k = knCoeff(n, N)
      s += k * state.a[n-1] * Math.cos(n * th)
      s += k * state.b[n-1] * Math.sin(n * th)
    }
    return s
  })

  const all  = [...(exactVals ?? []), ...outVals]
  const vMax = Math.max(...all), vMin = Math.min(...all)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.08, yMax = vMax + span * 0.08

  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB)
  hline(ctx, W, yOf(0))

  if (exactVals) drawLineCurve(ctx, W, H, exactVals, yMin, yMax, 'rgba(255,255,255,0.2)', 1.5)
  drawLineCurve(ctx, W, H, outVals, yMin, yMax, '#ffd93d', 2.5)

  ctx.save()
  ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
  if (exactVals) { ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillText('f(θ)', W - PR - 58, PT/2) }
  ctx.fillStyle = '#ffd93d'; ctx.fillText('(K∗f)(θ)', W - PR, PT/2)
  ctx.restore()

  panelTitle(ctx, '(K∗f)(θ)  —  output,  θ ∈ [0, 2π]')
}

function render() { renderBL(); renderR() }

// ── rAF loop ──────────────────────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop)
  if (!anim.active) return
  if (!anim.startTime) anim.startTime = ts
  const raw = Math.min(1, (ts - anim.startTime) / anim.dur)
  anim.t = raw * raw * (3 - 2 * raw)
  if (raw >= 1) anim.active = false
  render()
}
requestAnimationFrame(loop)

// ── Controls ──────────────────────────────────────────────────────────────────
const ctrlEl = document.getElementById('controls')

createSelect({
  container: ctrlEl, label: 'Function',
  options: Object.entries(WF).map(([v, w]) => ({ value: v, label: w.label })),
  value: state.wf,
  onChange: v => { state.wf = v; anim.active = false; resetCoeffs(); render() },
})

addDivider(ctrlEl)

const knWrap = document.createElement('div')
knWrap.className = 'ctrl-group'
ctrlEl.appendChild(knWrap)

const knLabel = document.createElement('span')
knLabel.className = 'ctrl-label'
knLabel.textContent = 'Kernel:'
knWrap.appendChild(knLabel)

const knGroup = document.createElement('div')
knGroup.className = 'fourier-kernel-group'
knWrap.appendChild(knGroup)

const knBtns = {}
for (const [key, kn] of Object.entries(KN)) {
  const btn = document.createElement('button')
  btn.className = 'fourier-kernel-btn' + (key === state.kn ? ' active' : '')
  btn.innerHTML =
    `<span class="fkb-name">${kn.label}</span>` +
    `<span class="fkb-formula">${kn.formula}</span>`

  btn.addEventListener('mouseenter', () => { hoverKn = key;  renderBL() })
  btn.addEventListener('mouseleave', () => { hoverKn = null; renderBL() })
  btn.addEventListener('click', () => {
    if (key === state.kn && !anim.active) return
    triggerAnim(key)
    refreshParam()
    for (const [k, b] of Object.entries(knBtns)) b.classList.toggle('active', k === key)
  })

  knGroup.appendChild(btn)
  knBtns[key] = btn
}

addDivider(ctrlEl)

createSlider({
  container: ctrlEl, label: 'Terms N',
  min: 2, max: 50, step: 1, value: state.N,
  format: v => Math.round(v),
  onChange: v => {
    const oldN = state.N
    state.N = Math.round(v)
    anim.active = false
    resizeCoeffs(oldN)
    render()
  },
})

const paramWrap = document.createElement('span')
paramWrap.style.display = 'contents'
ctrlEl.appendChild(paramWrap)

function refreshParam() {
  paramWrap.innerHTML = ''
  const p = KN[state.kn].param
  if (!p) return
  const div = document.createElement('div'); div.className = 'divider'
  paramWrap.appendChild(div)
  createSlider({
    container: paramWrap, label: p.label,
    min: p.min, max: p.max, step: p.step, value: state.param,
    format: v => v.toFixed(2),
    onChange: v => { state.param = v; anim.active = false; render() },
  })
}
refreshParam()

window.addEventListener('resize', render)
resetCoeffs()
render()
