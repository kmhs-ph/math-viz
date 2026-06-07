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
      if (t < Math.PI/2)    return 2*t/Math.PI
      if (t < 3*Math.PI/2)  return 2 - 2*t/Math.PI
      return 2*t/Math.PI - 4
    },
  },
}

// ── Kernels ───────────────────────────────────────────────────────────────────
const KN = {
  identity: {
    label: 'Fourier (identity)',
    coeff: (_n, _p, _N) => 1,
    graph: (θ, _p, N) => {
      const d = Math.sin(θ / 2)
      return Math.abs(d) < 1e-9 ? 2*N + 1 : Math.sin((N + 0.5) * θ) / d
    },
    param: null,
  },
  heat: {
    label: 'Heat kernel',
    coeff: (n, t) => Math.exp(-n * n * t),
    graph: (θ, t, N) => {
      let s = 1
      for (let n = 1; n <= N; n++) s += 2 * Math.exp(-n*n*t) * Math.cos(n * θ)
      return s
    },
    param: { label: 't', min: 0.01, max: 2, step: 0.01, def: 0.3 },
  },
  poisson: {
    label: 'Poisson kernel',
    coeff: (n, r) => Math.pow(r, n),
    graph: (θ, r) => (1 - r*r) / (1 - 2*r*Math.cos(θ) + r*r),
    param: { label: 'r', min: 0.05, max: 0.98, step: 0.01, def: 0.7 },
  },
  fejer: {
    label: 'Fejér kernel',
    coeff: (n, _p, N) => n < N ? 1 - n/N : 0,
    graph: (θ, _p, N) => {
      const d = Math.sin(θ / 2)
      return Math.abs(d) < 1e-9 ? N : Math.sin(N * θ / 2) ** 2 / (N * d * d)
    },
    param: null,
  },
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = { wf: 'square', kn: 'identity', N: 20, param: 1 }

// ── Canvas refs ───────────────────────────────────────────────────────────────
const CVTL = document.getElementById('canvas-tl')
const CVTR = document.getElementById('canvas-tr')
const CVBL = document.getElementById('canvas-bl')
const CVBR = document.getElementById('canvas-br')

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
const PL=10, PR=10, PT=30, PB=22

function panelTitle(ctx, text) {
  ctx.save()
  ctx.fillStyle = '#8892aa'
  ctx.font = '11px Inter, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, PL, PT / 2)
  ctx.restore()
}

function hline(ctx, W, y) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W-PR, y); ctx.stroke()
  ctx.restore()
}

function drawBars(ctx, W, H, vals, posCol) {
  const N   = vals.length
  const cW  = W - PL - PR
  const cH  = H - PT - PB
  const step = cW / N
  const barW = Math.max(1.5, step - 2)

  const vMax = Math.max(1e-9, ...vals)
  const vMin = Math.min(0, ...vals)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.04
  const yMax = vMax + span * 0.04
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

  // sparse n-axis tick labels
  ctx.save()
  ctx.fillStyle   = '#8892aa'
  ctx.font        = '9px "JetBrains Mono", monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign    = 'center'
  const ticks = [...new Set([1, Math.ceil(N/2), N])]
  for (const n of ticks) {
    ctx.fillText(n, PL + (n - 0.5) * step, H - PB + 3)
  }
  ctx.restore()
}

function drawCurve(ctx, W, H, vals, yMin, yMax, col, lw) {
  const cW  = W - PL - PR
  const cH  = H - PT - PB
  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH

  ctx.save()
  ctx.beginPath()
  ctx.strokeStyle = col
  ctx.lineWidth   = lw
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
  const kn = KN[state.kn], N = state.N
  drawBars(ctx, W, H, Array.from({length: N}, (_, i) => kn.coeff(i+1, state.param, N)), '#5ce05c')
  panelTitle(ctx, 'K̂(n)  — kernel coefficients')
}

function renderTR() {
  const [ctx, W, H] = prep(CVTR)
  ctx.clearRect(0, 0, W, H)
  const kn = KN[state.kn], N = state.N, M = 600
  const vals = Array.from({length: M+1}, (_, i) =>
    kn.graph(-Math.PI + 2*Math.PI*i/M, state.param, N))

  const vMax = Math.max(...vals)
  const vMin = Math.min(0, ...vals)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.04, yMax = vMax + span * 0.04

  const yOf = drawCurve(ctx, W, H, vals, yMin, yMax, '#5ce05c', 2)
  hline(ctx, W, yOf(0))
  panelTitle(ctx, 'K(θ)  — kernel graph,  θ ∈ [−π, π]')
}

function renderBL() {
  const [ctx, W, H] = prep(CVBL)
  ctx.clearRect(0, 0, W, H)
  const wf = WF[state.wf], kn = KN[state.kn], N = state.N
  drawBars(ctx, W, H, Array.from({length: N}, (_, i) => kn.coeff(i+1, state.param, N) * wf.b(i+1)), '#5b8dee')
  panelTitle(ctx, 'K̂(n)·f̂(n)  — modified coefficients')
}

function renderBR() {
  const [ctx, W, H] = prep(CVBR)
  ctx.clearRect(0, 0, W, H)

  const wf = WF[state.wf], kn = KN[state.kn], N = state.N, M = 600

  const exactVals = Array.from({length: M+1}, (_, i) => wf.exact(2*Math.PI*i/M))
  const outVals   = Array.from({length: M+1}, (_, i) => {
    const θ = 2*Math.PI*i/M
    let s = 0
    for (let n = 1; n <= N; n++) s += kn.coeff(n, state.param, N) * wf.b(n) * Math.sin(n * θ)
    return s
  })

  const all  = [...exactVals, ...outVals]
  const vMax = Math.max(...all), vMin = Math.min(...all)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.08, yMax = vMax + span * 0.08

  const yOf = v => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB)
  hline(ctx, W, yOf(0))

  drawCurve(ctx, W, H, exactVals, yMin, yMax, 'rgba(255,255,255,0.22)', 1.5)
  drawCurve(ctx, W, H, outVals,   yMin, yMax, '#ffd93d', 2.5)

  // right-side legend
  ctx.save()
  ctx.font = '10px Inter, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.4)';  ctx.fillText('f(θ)',    W - PR - 62, PT/2)
  ctx.fillStyle = '#ffd93d';                ctx.fillText('(K∗f)(θ)', W - PR,     PT/2)
  ctx.restore()

  panelTitle(ctx, '(K∗f)(θ)  — output,  θ ∈ [0, 2π]')
}

function render() {
  renderTL(); renderTR(); renderBL(); renderBR()
}

// ── Controls ──────────────────────────────────────────────────────────────────
const ctrlEl = document.getElementById('controls')

createSelect({
  container: ctrlEl, label: 'Function',
  options: Object.entries(WF).map(([v, w]) => ({ value: v, label: w.label })),
  value: state.wf,
  onChange: v => { state.wf = v; render() },
})

addDivider(ctrlEl)

createSelect({
  container: ctrlEl, label: 'Kernel',
  options: Object.entries(KN).map(([v, k]) => ({ value: v, label: k.label })),
  value: state.kn,
  onChange: v => {
    state.kn = v
    const p = KN[v].param
    if (p) state.param = p.def
    refreshParam()
    render()
  },
})

addDivider(ctrlEl)

createSlider({
  container: ctrlEl, label: 'Terms N',
  min: 2, max: 50, step: 1, value: state.N,
  format: v => Math.round(v),
  onChange: v => { state.N = Math.round(v); render() },
})

const paramWrap = document.createElement('span')
paramWrap.style.display = 'contents'
ctrlEl.appendChild(paramWrap)

function refreshParam() {
  paramWrap.innerHTML = ''
  const p = KN[state.kn].param
  if (!p) return
  const div = document.createElement('div')
  div.className = 'divider'
  paramWrap.appendChild(div)
  createSlider({
    container: paramWrap, label: p.label,
    min: p.min, max: p.max, step: p.step, value: state.param,
    format: v => v.toFixed(2),
    onChange: v => { state.param = v; render() },
  })
}
refreshParam()

window.addEventListener('resize', render)
render()
