import { createSlider, createSelect, addDivider } from '../../shared/controls.js'

// ── Waveforms ─────────────────────────────────────────────────────────────────
const WF = {
  square: {
    label: 'Square wave',
    b: n => n % 2 ? 4 / (n * Math.PI) : 0,
    exact: θ => {
      const t = ((θ % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return t < Math.PI ? 1 : -1
    },
  },
  sawtooth: {
    label: 'Sawtooth wave',
    b: n => 2 * Math.pow(-1, n+1) / (n * Math.PI),
    exact: θ => {
      const t = ((θ % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return t < Math.PI ? t / Math.PI : (t - 2*Math.PI) / Math.PI
    },
  },
  triangle: {
    label: 'Triangle wave',
    b: n => n % 2 ? 8 * Math.pow(-1, (n-1)/2) / (n*n*Math.PI*Math.PI) : 0,
    exact: θ => {
      const t = ((θ % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      if (t < Math.PI/2)   return 2*t/Math.PI
      if (t < 3*Math.PI/2) return 2 - 2*t/Math.PI
      return 2*t/Math.PI - 4
    },
  },
}

// ── Kernels ───────────────────────────────────────────────────────────────────
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
const state = { wf: 'square', kn: 'identity', N: 20, param: 1 }
let hoverKn = null

// ── Animation (kernel transition) ─────────────────────────────────────────────
const anim = {
  active: false,
  fromKn: 'identity', fromParam: 1,
  toKn:   'identity', toParam:   1,
  t: 1, startTime: null, dur: 520,
}

// Returns interpolated K̂(n) during animation
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
  anim.t = 0
  anim.startTime = null
  anim.active = true
}

// ── Canvas refs ───────────────────────────────────────────────────────────────
const CVTL = document.getElementById('canvas-tl')
const CVR  = document.getElementById('canvas-r')
const CVBL = document.getElementById('canvas-bl')

function prep(cv) {
  const dpr = window.devicePixelRatio || 1
  const r   = cv.parentElement.getBoundingClientRect()
  const W = r.width, H = r.height
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)) {
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr)
    const c = cv.getContext('2d')
    c.resetTransform(); c.scale(dpr, dpr)
  }
  return [cv.getContext('2d'), W, H]
}

// ── Drawing primitives ────────────────────────────────────────────────────────
const PL = 10, PR = 10, PT = 30, PB = 22

function panelTitle(ctx, text) {
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '11px Inter, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, PL, PT / 2)
  ctx.restore()
}

function hline(ctx, W, y) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke()
  ctx.restore()
}

function barStep(W, N) { return (W - PL - PR) / N }

function drawBars(ctx, W, H, vals, posCol, yMin, yMax) {
  const N = vals.length
  const cH   = H - PT - PB
  const step = barStep(W, N)
  const barW = Math.max(1.5, step - 2)
  const yOf  = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH
  const y0   = yOf(0)

  ctx.save()
  for (let i = 0; i < N; i++) {
    const v  = vals[i]
    const bx = PL + (i + 0.5) * step - barW / 2
    ctx.globalAlpha = 0.85
    ctx.fillStyle   = v >= 0 ? posCol : '#e05c5c'
    ctx.fillRect(bx, Math.min(yOf(v), y0), barW, Math.abs(yOf(v) - y0))
  }
  ctx.globalAlpha = 1
  ctx.restore()

  hline(ctx, W, y0)

  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '9px "JetBrains Mono",monospace'
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'
  for (const n of [...new Set([1, Math.ceil(N/2), N])]) {
    ctx.fillText(n, PL + (n - 0.5) * step, H - PB + 3)
  }
  ctx.restore()
}

// Smooth continuous K̂(n) curve (evaluated at fractional n)
function drawKernelCurve(ctx, W, H, knKey, param, yMin, yMax, N, color, lw) {
  const cH   = H - PT - PB
  const step = barStep(W, N)
  const yOf  = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH
  const SAMP = Math.max(60, N * 20)

  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = lw
  ctx.beginPath()
  for (let i = 0; i <= SAMP; i++) {
    const n = 1 + (N - 1) * i / SAMP
    const v = KN[knKey].coeff(n, param, N)
    const x = PL + (n - 0.5) * step
    i === 0 ? ctx.moveTo(x, yOf(v)) : ctx.lineTo(x, yOf(v))
  }
  ctx.stroke()
  ctx.restore()
}

function drawLineCurve(ctx, W, H, vals, yMin, yMax, col, lw) {
  const cW = W - PL - PR, cH = H - PT - PB
  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH
  ctx.save()
  ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = lw
  vals.forEach((v, i) => {
    const x = PL + (i / (vals.length - 1)) * cW
    i === 0 ? ctx.moveTo(x, yOf(v)) : ctx.lineTo(x, yOf(v))
  })
  ctx.stroke()
  ctx.restore()
  return yOf
}

// ── Panel renderers ───────────────────────────────────────────────────────────

function renderTL() {
  const [ctx, W, H] = prep(CVTL)
  ctx.clearRect(0, 0, W, H)
  const N = state.N

  // K̂(n) always in [0,1] → fixed y-scale
  const yMin = -0.04, yMax = 1.08

  const vals = Array.from({length: N}, (_, i) => knCoeff(i+1, N))
  drawBars(ctx, W, H, vals, '#5ce05c', yMin, yMax)

  // Smooth curve overlay for hovered (non-active) kernel
  if (hoverKn && hoverKn !== state.kn) {
    drawKernelCurve(ctx, W, H, hoverKn, kernelParamFor(hoverKn), yMin, yMax, N,
      'rgba(255,255,255,0.28)', 2)
  }

  panelTitle(ctx, 'K̂(n)  — kernel coefficients')
}

function renderBL() {
  const [ctx, W, H] = prep(CVBL)
  ctx.clearRect(0, 0, W, H)
  const N = state.N
  const wf = WF[state.wf]

  // Fixed y-scale based on ORIGINAL f̂(n) so bars visibly "press down" on kernel change
  const origVals = Array.from({length: N}, (_, i) => wf.b(i+1))
  const vMax = Math.max(1e-9, ...origVals)
  const vMin = Math.min(0, ...origVals)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.05, yMax = vMax + span * 0.05

  const vals = Array.from({length: N}, (_, i) => knCoeff(i+1, N) * wf.b(i+1))
  drawBars(ctx, W, H, vals, '#5b8dee', yMin, yMax)

  const isIdentity = state.kn === 'identity' && !anim.active
  panelTitle(ctx, isIdentity ? 'f̂(n)  — Fourier coefficients' : 'K̂(n)·f̂(n)  — filtered coefficients')
}

function renderR() {
  const [ctx, W, H] = prep(CVR)
  ctx.clearRect(0, 0, W, H)

  const wf = WF[state.wf], N = state.N, M = 600

  const exactVals = Array.from({length: M+1}, (_, i) => wf.exact(2*Math.PI*i/M))
  const outVals   = Array.from({length: M+1}, (_, i) => {
    const θ = 2*Math.PI*i/M
    let s = 0
    for (let n = 1; n <= N; n++) s += knCoeff(n, N) * wf.b(n) * Math.sin(n * θ)
    return s
  })

  const all  = [...exactVals, ...outVals]
  const vMax = Math.max(...all), vMin = Math.min(...all)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.08, yMax = vMax + span * 0.08

  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB)
  hline(ctx, W, yOf(0))

  drawLineCurve(ctx, W, H, exactVals, yMin, yMax, 'rgba(255,255,255,0.2)', 1.5)
  drawLineCurve(ctx, W, H, outVals,   yMin, yMax, '#ffd93d', 2.5)

  ctx.save()
  ctx.font = '10px Inter, sans-serif'
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillText('f(θ)',     W - PR - 58, PT/2)
  ctx.fillStyle = '#ffd93d';               ctx.fillText('(K∗f)(θ)', W - PR,      PT/2)
  ctx.restore()

  panelTitle(ctx, '(K∗f)(θ)  — output,  θ ∈ [0, 2π]')
}

function render() { renderTL(); renderBL(); renderR() }

// ── rAF loop (animation only) ─────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop)
  if (!anim.active) return
  if (!anim.startTime) anim.startTime = ts
  const raw = Math.min(1, (ts - anim.startTime) / anim.dur)
  anim.t = raw * raw * (3 - 2 * raw)   // smoothstep
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
  onChange: v => { state.wf = v; anim.active = false; render() },
})

addDivider(ctrlEl)

// Kernel button group
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

  btn.addEventListener('mouseenter', () => { hoverKn = key;  renderTL() })
  btn.addEventListener('mouseleave', () => { hoverKn = null; renderTL() })
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
  onChange: v => { state.N = Math.round(v); anim.active = false; render() },
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
render()
