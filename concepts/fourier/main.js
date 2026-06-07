import { createSlider, createSelect, addDivider } from '../../shared/controls.js'

const C = (re, im) => ({ re, im })
const cmag  = c => Math.hypot(c.re, c.im)
const carg  = c => Math.atan2(c.im, c.re)
const cscale = (k, c) => C(k * c.re, k * c.im)

// ── Waveforms ─────────────────────────────────────────────────────────────────
const WF = {
  square: {
    label: 'Square wave',
    c: n => n % 2 ? C(0, -2 / (n * Math.PI)) : C(0, 0),
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return x < Math.PI ? 1 : -1
    },
  },
  sawtooth: {
    label: 'Sawtooth wave',
    c: n => C(0, Math.pow(-1, n) / (n * Math.PI)),
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      return x < Math.PI ? x / Math.PI : (x - 2*Math.PI) / Math.PI
    },
  },
  triangle: {
    label: 'Triangle wave',
    c: n => n % 2 ? C(0, -4 * Math.pow(-1, (n-1)/2) / (n*n * Math.PI*Math.PI)) : C(0, 0),
    exact: t => {
      const x = ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)
      if (x < Math.PI/2)   return 2*x/Math.PI
      if (x < 3*Math.PI/2) return 2 - 2*x/Math.PI
      return 2*x/Math.PI - 4
    },
  },
  dirac: {
    label: 'Dirac delta',
    c: _n => C(0, -1 / Math.PI),
    exact: null,
  },
  custom: {
    label: 'Custom',
    c: null,
    exact: null,
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
const state = {
  wf: 'square', kn: 'identity', N: 20, param: 1,
  c: [],
  baseMax: 1,
  selectedN: null,
}

function resetCoeffs() {
  if (state.wf === 'custom') return
  const wf = WF[state.wf], N = state.N
  state.c = Array.from({length: N+1}, (_, n) => n === 0 ? C(0, 0) : wf.c(n))
  state.baseMax = Math.max(0.2, ...state.c.map(cmag)) * 1.5
}

function resizeCoeffs(oldN) {
  const N = state.N
  if (N > oldN) {
    const wf = WF[state.wf]
    for (let n = oldN + 1; n <= N; n++) {
      state.c.push(state.wf === 'custom' ? C(0, 0) : wf.c(n))
    }
    state.baseMax = Math.max(state.baseMax, ...state.c.map(cmag))
  } else {
    state.c.length = N + 1
    if (state.selectedN !== null && state.selectedN > N) state.selectedN = null
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
  if (n === 0) return 1
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
  anim.fromKn = state.kn; anim.fromParam = state.param
  state.kn = newKnKey
  const p = KN[newKnKey].param; if (p) state.param = p.def
  anim.toKn = state.kn; anim.toParam = state.param
  anim.t = 0; anim.startTime = null; anim.active = true
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const CVTL = document.getElementById('canvas-tl')
const CVBL = document.getElementById('canvas-bl')
const CVR  = document.getElementById('canvas-r')

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

function phaseColor(arg, alpha = 1) {
  const hue = ((arg / Math.PI + 1) / 2) * 360
  return `hsla(${hue.toFixed(1)},82%,58%,${alpha})`
}

let tlStep = 0
let blCPlane = { cx: 0, cy: 0, scale: 100 }
let blDrag = false

// ── renderTL — bars show |ĉₙ|, kernel K̂(n) as smooth curve overlay ───────────
function renderTL() {
  const [ctx, W, H] = prep(CVTL)
  ctx.clearRect(0, 0, W, H)

  const N = state.N
  const PT = 28, PB = 20
  const cH   = H - PT - PB
  const yMax = state.baseMax
  const yOf  = v => PT + (1 - v / yMax) * cH
  const y0   = yOf(0)

  const nBars = N + 1
  const step  = (W - PL - PR) / nBars
  tlStep = step
  const barW = Math.max(1.5, step - 2)

  // Bars: height = K̂(n)·|ĉₙ|, color = phase of ĉₙ
  for (let n = 0; n <= N; n++) {
    const cn     = state.c[n]
    const k      = knCoeff(n, N)
    const mag    = cmag(cn)
    const effMag = k * mag
    const bx     = PL + (n + 0.5) * step - barW / 2
    const barTop = yOf(effMag)
    const barH   = Math.max(0, y0 - barTop)

    ctx.fillStyle = mag < 1e-9 ? 'rgba(100,105,135,0.55)' : phaseColor(carg(cn), 0.85)
    ctx.fillRect(bx, barTop, barW, barH)

    if (n === state.selectedN) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5
      ctx.strokeRect(bx - 0.5, barTop - 0.5, barW + 1, barH + 1)
      ctx.restore()
    }
  }

  const SAMP = Math.max(80, N * 20)

  // Active kernel curve — K̂(n) mapped onto [0, yMax]
  // Shown when non-identity (or animating) and not hovering a different kernel
  const showActive = (state.kn !== 'identity' || anim.active) && !(hoverKn && hoverKn !== state.kn)
  if (showActive) {
    ctx.save()
    ctx.strokeStyle = 'rgba(92,224,92,0.45)'; ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= SAMP; i++) {
      const nf = N * i / SAMP
      const kv = knCoeff(nf, N)
      const x  = PL + (nf + 0.5) * step
      const y  = yOf(kv * yMax)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke(); ctx.restore()
  }

  // Hover kernel preview — shows K̂_hover(n) shape
  if (hoverKn && hoverKn !== state.kn) {
    const param = kernelParamFor(hoverKn)
    ctx.save()
    ctx.strokeStyle = 'rgba(92,224,92,0.62)'; ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i <= SAMP; i++) {
      const nf = N * i / SAMP
      const kv = nf === 0 ? 1 : KN[hoverKn].coeff(nf, param, N)
      const x  = PL + (nf + 0.5) * step
      const y  = yOf(kv * yMax)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke(); ctx.restore()
  }

  // n-axis labels
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '9px "JetBrains Mono",monospace'
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'
  for (const n of [...new Set([0, 1, Math.ceil(N/2), N])]) {
    ctx.fillText(n, PL + (n + 0.5) * step, y0 + 3)
  }
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'middle'
  const isIdent = state.kn === 'identity' && !anim.active
  ctx.fillText(isIdent ? '|ĉₙ|  —  Fourier spectrum' : '|K̂ₙ·ĉₙ|  —  filtered spectrum', PL, PT / 2)
  ctx.restore()
}

// ── renderBL — complex plane: ĉₙ (base, draggable) + K̂·ĉₙ (filtered) ─────────
function renderBL() {
  const [ctx, W, H] = prep(CVBL)
  ctx.clearRect(0, 0, W, H)

  if (state.selectedN === null) {
    ctx.save()
    ctx.fillStyle = '#8892aa'; ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('계수 막대를 클릭하세요', W/2, H/2)
    ctx.restore()
    return
  }

  const n   = state.selectedN
  const cn  = state.c[n]
  const k   = knCoeff(n, state.N)
  const eff = cscale(k, cn)
  const bm  = cmag(cn)

  const cx = W / 2, cy = H / 2
  const plotR = Math.min(W, H) * 0.38
  const scale = plotR / state.baseMax
  blCPlane = { cx, cy, scale }

  const toPx = (re, im) => [cx + re * scale, cy - im * scale]

  // Grid
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'; ctx.lineWidth = 1
  const gs = state.baseMax / 2
  for (let v = -5; v <= 5; v++) {
    const g = v * gs
    ctx.beginPath(); ctx.moveTo(...toPx(g, -state.baseMax*3)); ctx.lineTo(...toPx(g, state.baseMax*3)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(...toPx(-state.baseMax*3, g)); ctx.lineTo(...toPx(state.baseMax*3, g)); ctx.stroke()
  }
  ctx.restore()

  // Axes
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '9px "JetBrains Mono",monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top';    ctx.fillText('Re', W - 16, cy + 4)
  ctx.textBaseline = 'middle'; ctx.fillText('Im', cx + 4, 10)
  ctx.restore()

  const em = cmag(eff)
  const kernelActive = Math.abs(k - 1) > 0.02

  // Dashed circle at |ĉₙ| — reference for base magnitude
  if (bm > 1e-9) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5])
    ctx.beginPath(); ctx.arc(cx, cy, bm * scale, 0, 2*Math.PI); ctx.stroke()
    ctx.restore()
  }

  // Base ĉₙ — secondary dashed indicator when kernel is active
  if (bm > 1e-9 && kernelActive) {
    const [bx, by] = toPx(cn.re, cn.im)
    const baseArg = carg(cn)
    ctx.save()
    ctx.strokeStyle = phaseColor(baseArg, 0.3); ctx.lineWidth = 1.5; ctx.setLineDash([2, 4])
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = phaseColor(baseArg, 0.55); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, 2*Math.PI); ctx.stroke()
    ctx.restore()
  }

  // Effective K̂·ĉₙ — main draggable point
  const mainC  = kernelActive ? eff : cn
  const mainM  = kernelActive ? em  : bm
  if (mainM > 1e-9) {
    const [mx, my] = toPx(mainC.re, mainC.im)
    const arg  = carg(mainC)
    const arcR = Math.min(mainM * scale * 0.4, 26)

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, arcR, 0, -arg, arg > 0); ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = phaseColor(arg, 0.8); ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#8892aa'; ctx.font = '9px "JetBrains Mono",monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(mainM.toFixed(3), mx, my - 9)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = phaseColor(arg, 1)
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, 2*Math.PI); ctx.fill()
    ctx.restore()
  } else {
    ctx.save()
    ctx.fillStyle = 'rgba(180,180,200,0.6)'
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2*Math.PI); ctx.fill()
    ctx.restore()
  }

  // Title: shows effective value (what's being dragged)
  const dRe  = mainC.re, dIm = mainC.im
  const sign  = dIm >= 0 ? '+' : '−'
  const prefix = kernelActive ? `K̂·ĉ${n}` : `ĉ${n}`
  const label  = `${prefix}  =  ${dRe.toFixed(3)} ${sign} ${Math.abs(dIm).toFixed(3)}i`
  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle'
  ctx.fillText(label, PL, 12)
  ctx.restore()
}

// ── renderR ───────────────────────────────────────────────────────────────────
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
    let s = state.c[0].re
    for (let n = 1; n <= N; n++) {
      const k  = knCoeff(n, N)
      const cn = state.c[n]
      s += 2 * k * (cn.re * Math.cos(n * th) - cn.im * Math.sin(n * th))
    }
    return s
  })

  const all  = [...(exactVals ?? []), ...outVals]
  const vMax = Math.max(...all), vMin = Math.min(...all)
  const span = Math.max(vMax - vMin, 1e-9)
  const yMin = vMin - span * 0.08, yMax = vMax + span * 0.08
  const cH   = H - PT - PB
  const yOf  = v => PT + (1 - (v - yMin) / (yMax - yMin)) * cH

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PL, yOf(0)); ctx.lineTo(W - PR, yOf(0)); ctx.stroke()
  ctx.restore()

  const drawCurve = (vals, col, lw) => {
    const cW = W - PL - PR
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = lw
    vals.forEach((v, i) => {
      const x = PL + (i / M) * cW
      i === 0 ? ctx.moveTo(x, yOf(v)) : ctx.lineTo(x, yOf(v))
    })
    ctx.stroke(); ctx.restore()
  }

  if (exactVals) drawCurve(exactVals, 'rgba(255,255,255,0.2)', 1.5)
  drawCurve(outVals, '#ffd93d', 2.5)

  ctx.save()
  ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
  if (exactVals) { ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillText('f(θ)', W - PR - 60, PT/2) }
  ctx.fillStyle = '#ffd93d'; ctx.fillText('(K∗f)(θ)', W - PR, PT/2)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#8892aa'; ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'middle'
  ctx.fillText('(K∗f)(θ)  —  output,  θ ∈ [0, 2π]', PL, PT/2)
  ctx.restore()
}

function render() { renderTL(); renderBL(); renderR() }

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

// ── TL: click to select bar ───────────────────────────────────────────────────
CVTL.addEventListener('click', e => {
  if (tlStep <= 0) return
  const rect = CVTL.getBoundingClientRect()
  const n = Math.floor((e.clientX - rect.left - PL) / tlStep)
  if (n >= 0 && n <= state.N) {
    state.selectedN = state.selectedN === n ? null : n
    renderTL(); renderBL()
  }
})

CVTL.addEventListener('mousemove', e => {
  const rect = CVTL.getBoundingClientRect()
  const n = Math.floor((e.clientX - rect.left - PL) / tlStep)
  CVTL.style.cursor = (n >= 0 && n <= state.N) ? 'pointer' : 'default'
})

CVTL.addEventListener('mouseleave', () => { CVTL.style.cursor = 'default' })

// ── BL: drag sets K̂(n)·ĉₙ = drag_point, inverts to ĉₙ = drag_point / K̂(n) ──
function applyBLDrag(e) {
  const rect = CVBL.getBoundingClientRect()
  const { cx, cy, scale } = blCPlane
  if (!scale) return
  const re = (e.clientX - rect.left - cx) / scale
  const im = -(e.clientY - rect.top  - cy) / scale
  const n  = state.selectedN
  if (n === null) return
  const k = knCoeff(n, state.N)
  if (Math.abs(k) > 1e-6) {
    state.c[n] = n === 0 ? C(re / k, 0) : C(re / k, im / k)
  } else {
    state.c[n] = n === 0 ? C(re, 0) : C(re, im)
  }
  if (state.wf !== 'custom') {
    state.wf = 'custom'
    wfSelectEl.value = 'custom'
  }
  render()
}

CVBL.addEventListener('mousedown', e => {
  if (state.selectedN === null) return
  blDrag = true
  CVBL.style.cursor = 'grabbing'
  applyBLDrag(e)
  e.preventDefault()
})

window.addEventListener('mousemove', e => { if (blDrag) applyBLDrag(e) })
window.addEventListener('mouseup',   () => {
  if (blDrag) { blDrag = false; CVBL.style.cursor = state.selectedN !== null ? 'grab' : 'default' }
})

CVBL.addEventListener('mousemove',  () => { if (!blDrag) CVBL.style.cursor = state.selectedN !== null ? 'grab' : 'default' })
CVBL.addEventListener('mouseleave', () => { if (!blDrag) CVBL.style.cursor = 'default' })

// ── Controls ──────────────────────────────────────────────────────────────────
const ctrlEl = document.getElementById('controls')

createSelect({
  container: ctrlEl, label: 'Function',
  options: Object.entries(WF).map(([v, w]) => ({ value: v, label: w.label })),
  value: state.wf,
  onChange: v => { state.wf = v; anim.active = false; resetCoeffs(); render() },
})
const wfSelectEl = ctrlEl.querySelector('select')

addDivider(ctrlEl)

const knWrap = document.createElement('div')
knWrap.className = 'ctrl-group'
ctrlEl.appendChild(knWrap)
const knLabel = document.createElement('span')
knLabel.className = 'ctrl-label'; knLabel.textContent = 'Kernel:'
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
    triggerAnim(key); refreshParam()
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
    const old = state.N; state.N = Math.round(v)
    anim.active = false; resizeCoeffs(old); render()
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
