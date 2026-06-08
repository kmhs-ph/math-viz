import { createSlider, createSelect, addDivider } from '../../shared/controls.js'

// ── SO(3) math ────────────────────────────────────────────────────────────────

const I3 = [[1,0,0],[0,1,0],[0,0,1]]

function mul3(A, B) {
  return A.map((row, i) =>
    [0,1,2].map(j => row.reduce((s, _, k) => s + A[i][k]*B[k][j], 0))
  )
}

function apply3(M, [x,y,z]) {
  return [M[0][0]*x+M[0][1]*y+M[0][2]*z,
          M[1][0]*x+M[1][1]*y+M[1][2]*z,
          M[2][0]*x+M[2][1]*y+M[2][2]*z]
}

const Rx = t => { const c=Math.cos(t),s=Math.sin(t); return [[1,0,0],[0,c,-s],[0,s,c]] }
const Ry = t => { const c=Math.cos(t),s=Math.sin(t); return [[c,0,s],[0,1,0],[-s,0,c]] }
const Rz = t => { const c=Math.cos(t),s=Math.sin(t); return [[c,-s,0],[s,c,0],[0,0,1]] }

// ── Generator pairs ───────────────────────────────────────────────────────────
// [Lx,Ly]=Lz, [Ly,Lz]=Lx, [Lz,Lx]=Ly
// Killing field of Lz: (x,y,z)→(-y,x,0); Lx: →(0,-z,y); Ly: →(z,0,-x)

const PAIRS = {
  xy: { label:'Lx, Ly  →  [Lx,Ly] = Lz', RA: Rx, RB: Ry, RC: Rz,
        field: ([x,y]) => [-y, x, 0],   fieldLabel:'Lz  =  [Lx,Ly]', commLabel:'Rz(t²)' },
  yz: { label:'Ly, Lz  →  [Ly,Lz] = Lx', RA: Ry, RB: Rz, RC: Rx,
        field: ([,y,z]) => [0, -z, y],  fieldLabel:'Lx  =  [Ly,Lz]', commLabel:'Rx(t²)' },
  zx: { label:'Lz, Lx  →  [Lz,Lx] = Ly', RA: Rz, RB: Rx, RC: Ry,
        field: ([x,,z]) => [z, 0, -x],  fieldLabel:'Ly  =  [Lz,Lx]', commLabel:'Ry(t²)' },
}

// ── Sphere grid ────────────────────────────────────────────────────────────────

function sphPt(latDeg, lonDeg) {
  const la = latDeg*Math.PI/180, lo = lonDeg*Math.PI/180
  return [Math.cos(la)*Math.cos(lo), Math.cos(la)*Math.sin(lo), Math.sin(la)]
}

const GRID = (() => {
  const N = 72, lines = []
  // 12 meridians
  for (let lo = 0; lo < 360; lo += 30) {
    const pts = []
    for (let i = 0; i <= N; i++) pts.push(sphPt(-90 + 180*i/N, lo))
    lines.push({ pts, isEquator: false, isPrime: lo === 0 })
  }
  // 6 latitude circles
  for (let la = -60; la <= 60; la += 30) {
    const pts = []
    for (let i = 0; i <= N; i++) pts.push(sphPt(la, 360*i/N))
    lines.push({ pts, isEquator: la === 0, isPrime: false })
  }
  return lines
})()

// ── Commutator steps ──────────────────────────────────────────────────────────

function getStepMs(t, pair) {
  const {RA, RB} = pair
  const M1 = RB(-t)
  const M2 = mul3(RA(-t), M1)
  const M3 = mul3(RB( t), M2)
  const M4 = mul3(RA( t), M3)
  return [I3, M1, M2, M3, M4]
}

function interpM(p, t, pair) {
  const {RA, RB} = pair
  const [,M1,M2,M3] = getStepMs(t, pair)
  if (p <= 0) return I3
  if (p <= 1) return RB(-p*t)
  if (p <= 2) return mul3(RA(-(p-1)*t), M1)
  if (p <= 3) return mul3(RB( (p-2)*t), M2)
  if (p <= 4) return mul3(RA( (p-3)*t), M3)
  return getStepMs(t, pair)[4]
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  pairKey:   'xy',
  t:          0.6,
  progress:   0.0,
  playing:    false,
  showField:  true,
  showPred:   true,
}

const cam = { az: 0.45, el: 0.35 }

// ── Canvas ────────────────────────────────────────────────────────────────────

const CV  = document.getElementById('la-canvas')
const ctx = CV.getContext('2d')
let raf = null

function resize() {
  const dpr = window.devicePixelRatio || 1
  CV.width  = CV.clientWidth  * dpr
  CV.height = CV.clientHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}
window.addEventListener('resize', resize)

// ── Camera drag ───────────────────────────────────────────────────────────────

let dragState = null
CV.addEventListener('mousedown', e => {
  dragState = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el }
})
window.addEventListener('mousemove', e => {
  if (!dragState) return
  cam.az = dragState.az + (e.clientX - dragState.x) * 0.008
  cam.el = Math.max(-1.3, Math.min(1.3, dragState.el - (e.clientY - dragState.y) * 0.008))
  render()
})
window.addEventListener('mouseup', () => { dragState = null })

function camMatrix() { return mul3(Ry(cam.az), Rx(-cam.el)) }

// ── Projection ────────────────────────────────────────────────────────────────

function proj(p3, Rcam, cx, cy, sc) {
  const [qx,qy,qz] = apply3(Rcam, p3)
  return { sx: cx + qx*sc, sy: cy - qy*sc, depth: qz }
}

// ── Draw functions ────────────────────────────────────────────────────────────

function drawSphSegments(pts, M, Rcam, cx, cy, sc, frontStyle, backStyle) {
  for (let i = 0; i < pts.length-1; i++) {
    const a = proj(apply3(M, pts[i]),   Rcam, cx, cy, sc)
    const b = proj(apply3(M, pts[i+1]), Rcam, cx, cy, sc)
    const front = (a.depth + b.depth) >= 0
    const st = front ? frontStyle : backStyle
    if (!st) continue
    ctx.beginPath()
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
    ctx.strokeStyle = st.color; ctx.lineWidth = st.lw
    if (st.dash) ctx.setLineDash(st.dash); else ctx.setLineDash([])
    ctx.stroke()
  }
}

function drawSphere(M, Rcam, cx, cy, sc, frontAlpha, backAlpha, baseColor, lw=1.0) {
  for (const line of GRID) {
    const extraFront = line.isEquator ? 0.5 : line.isPrime ? 0.3 : 0
    const fa = Math.min(1, frontAlpha + extraFront)
    const ba = backAlpha
    const fw = line.isEquator ? lw*1.6 : lw
    const bw = line.isEquator ? lw*0.8 : lw*0.5
    drawSphSegments(line.pts, M, Rcam, cx, cy, sc,
      { color: baseColor.replace('A', fa.toFixed(2)), lw: fw },
      ba > 0.005 ? { color: baseColor.replace('A', ba.toFixed(2)), lw: bw } : null
    )
  }
}

function drawDashedSphere(M, Rcam, cx, cy, sc, color, lw=1.5) {
  for (const line of GRID) {
    const pts = line.pts
    for (let i = 0; i < pts.length-1; i++) {
      const a = proj(apply3(M, pts[i]),   Rcam, cx, cy, sc)
      const b = proj(apply3(M, pts[i+1]), Rcam, cx, cy, sc)
      if ((a.depth + b.depth) < 0) continue
      ctx.beginPath()
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
      ctx.strokeStyle = color; ctx.lineWidth = lw
      ctx.setLineDash([5, 4])
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
}

function drawDot3D(p3, M, Rcam, cx, cy, sc, color, r=5) {
  const q = proj(apply3(M, p3), Rcam, cx, cy, sc)
  const alpha = q.depth >= 0 ? 1.0 : 0.3
  ctx.beginPath()
  ctx.arc(q.sx, q.sy, r, 0, 2*Math.PI)
  ctx.fillStyle = color.replace('A', alpha.toFixed(2))
  ctx.fill()
}

function drawAxis(dir, label, color, Rcam, cx, cy, sc) {
  const a = proj(dir.map(v => -v*1.35), Rcam, cx, cy, sc)
  const b = proj(dir.map(v =>  v*1.35), Rcam, cx, cy, sc)
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1.2
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
  ctx.restore()
  ctx.fillStyle = color; ctx.font = '13px "JetBrains Mono", monospace'
  ctx.fillText(label, b.sx + 5, b.sy - 3)
}

function drawVField(pair, Rcam, cx, cy, sc, alpha) {
  const color = `rgba(72,215,130,${alpha.toFixed(2)})`
  const LATS = [-60,-30,0,30,60]
  const LONS = [0,45,90,135,180,225,270,315]
  const SCALE = 0.20
  for (const la of LATS) {
    for (const lo of LONS) {
      const p = sphPt(la, lo)
      const raw = pair.field(p)
      const len = Math.hypot(...raw)
      if (len < 0.01) continue
      const v = raw.map(c => c/len * SCALE)
      const ep = [p[0]+v[0], p[1]+v[1], p[2]+v[2]]

      const a = proj(p,  Rcam, cx, cy, sc)
      const b = proj(ep, Rcam, cx, cy, sc)
      if (a.depth < -0.05) continue

      const dx=b.sx-a.sx, dy=b.sy-a.sy, dl=Math.hypot(dx,dy)
      if (dl < 3) continue
      const ux=dx/dl, uy=dy/dl, hw=3, hl=7

      ctx.save()
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx-ux*hl, b.sy-uy*hl); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.sx, b.sy)
      ctx.lineTo(b.sx-ux*hl-uy*hw, b.sy-uy*hl+ux*hw)
      ctx.lineTo(b.sx-ux*hl+uy*hw, b.sy-uy*hl-ux*hw)
      ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

const STEP_COL  = ['rgba(210,210,230,A)','rgba(70,155,255,A)','rgba(155,70,255,A)','rgba(255,148,55,A)','rgba(255,75,75,A)']
const STEP_HEX  = ['#d2d2e6','#469bff','#9b46ff','#ff943a','#ff4b4b']
const STEP_LAB  = ['I  (start)','Rb(−t)','Ra(−t)Rb(−t)','Rb(t)Ra(−t)Rb(−t)','commutator']

let progSl  = null
let playBtn = null

function render() {
  const W = CV.clientWidth, H = CV.clientHeight
  ctx.clearRect(0, 0, W, H)

  const pair = PAIRS[state.pairKey]
  const t    = state.t, p = state.progress
  const f    = Math.min(Math.floor(p), 4)

  const Rcam   = camMatrix()
  const sc     = Math.min(W, H) * 0.36
  const cx     = W/2, cy = H/2

  const stepMs = getStepMs(t, pair)
  const Mcur   = interpM(p, t, pair)
  const Mpred  = pair.RC(t*t)

  // 1. Reference ghost sphere (identity, always)
  drawSphere(I3, Rcam, cx, cy, sc, 0.10, 0.03, 'rgba(220,220,240,A)', 0.7)

  // 2. Past step traces (completed steps, faint)
  for (let s = 1; s <= f; s++) {
    const a = s === f ? 0.30 : 0.12
    drawSphere(stepMs[s], Rcam, cx, cy, sc, a, a*0.25, STEP_COL[s], 0.7)
    drawDot3D([0,0,1], stepMs[s], Rcam, cx, cy, sc, STEP_COL[s].replace(/,A/, `,${a}`))
  }

  // 3. Current sphere (animated)
  const curS = f < 4 ? f+1 : 4
  drawSphere(Mcur, Rcam, cx, cy, sc, 0.75, 0.20, STEP_COL[curS], 1.5)
  drawDot3D([0,0,1], Mcur, Rcam, cx, cy, sc, STEP_COL[curS].replace('A','A'))

  // 4. Prediction sphere exp(t²[X,Y]) — dashed green
  if (state.showPred && p >= 3.8) {
    const a = Math.min(1, (p-3.8)/0.3)
    drawDashedSphere(Mpred, Rcam, cx, cy, sc, `rgba(72,215,130,${(0.75*a).toFixed(2)})`, 1.8)
    drawDot3D([0,0,1], Mpred, Rcam, cx, cy, sc, `rgba(72,215,130,A)`.replace('A', a.toFixed(2)), 4)
  }

  // 5. Vector field [X,Y] on sphere (fade in as p→4)
  const fAlpha = state.showField ? Math.max(0, Math.min(1, (p-3.5)*2)) : 0
  if (fAlpha > 0.01) drawVField(pair, Rcam, cx, cy, sc, fAlpha)

  // 6. Axes
  ctx.setLineDash([])
  drawAxis([1,0,0], 'x', 'rgba(255,100,100,0.7)', Rcam, cx, cy, sc)
  drawAxis([0,1,0], 'y', 'rgba(100,215,100,0.7)', Rcam, cx, cy, sc)
  drawAxis([0,0,1], 'z', 'rgba(100,150,255,0.7)', Rcam, cx, cy, sc)

  // 7. Legend
  ctx.font = '11.5px "JetBrains Mono", monospace'
  let ly = 24, lx = 16
  const nShow = Math.min(Math.ceil(p) + 1, 5)
  for (let s = 0; s < nShow; s++) {
    ctx.fillStyle = STEP_HEX[s]; ctx.fillRect(lx, ly-10, 13, 11)
    ctx.fillStyle = 'rgba(148,163,184,0.9)'
    ctx.fillText(STEP_LAB[s], lx+17, ly)
    ly += 18
  }
  if (state.showPred && p >= 3.8) {
    ctx.save(); ctx.setLineDash([5,4])
    ctx.strokeStyle='rgba(72,215,130,0.85)'; ctx.lineWidth=2
    ctx.beginPath(); ctx.moveTo(lx,ly-5); ctx.lineTo(lx+13,ly-5); ctx.stroke()
    ctx.restore()
    ctx.fillStyle='rgba(148,163,184,0.9)'; ctx.fillText(pair.commLabel+' (pred.)', lx+17, ly)
    ly += 18
  }
  if (fAlpha > 0.1) {
    ctx.fillStyle='rgba(72,215,130,0.9)'; ctx.fillRect(lx, ly-10, 13, 11)
    ctx.fillStyle='rgba(148,163,184,0.9)'; ctx.fillText('vf: '+pair.fieldLabel, lx+17, ly)
  }

  // 8. Bottom info
  ctx.font = '11px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(148,163,184,0.50)'
  ctx.setLineDash([])
  ctx.fillText('t = '+t.toFixed(2)+'  |  drag to orbit', lx, H - 12)
}

// ── Animation ─────────────────────────────────────────────────────────────────

let lastTs = null

function animate(ts) {
  if (!state.playing) return
  if (!lastTs) lastTs = ts
  const dt = (ts - lastTs) / 1000
  lastTs = ts
  state.progress = Math.min(4, state.progress + dt * 0.8)
  progSl?.setValue(state.progress)
  render()
  if (state.progress < 4) {
    raf = requestAnimationFrame(animate)
  } else {
    state.playing = false; lastTs = null
    if (playBtn) playBtn.textContent = '▶  Play'
  }
}

function startPlay() {
  if (state.progress >= 4) { state.progress = 0; progSl?.setValue(0) }
  state.playing = true; lastTs = null
  if (playBtn) playBtn.textContent = '⏸  Pause'
  raf = requestAnimationFrame(animate)
}

function stopPlay() {
  state.playing = false; lastTs = null
  if (playBtn) playBtn.textContent = '▶  Play'
  if (raf) { cancelAnimationFrame(raf); raf = null }
}

// ── Controls ──────────────────────────────────────────────────────────────────

function buildControls() {
  const el = document.getElementById('la-controls')

  createSelect({
    container: el, label: 'Generators',
    options: Object.entries(PAIRS).map(([v, p]) => ({ value: v, label: p.label })),
    value: state.pairKey,
    onChange: v => { state.pairKey = v; render() },
  })

  createSlider({
    container: el, label: 't', min: 0.05, max: 1.6, step: 0.05, value: state.t,
    format: v => v.toFixed(2),
    onChange: v => { state.t = v; render() },
  })

  addDivider(el)

  progSl = createSlider({
    container: el, label: 'Step', min: 0, max: 4, step: 0.01, value: state.progress,
    format: v => v.toFixed(2),
    onChange: v => { state.progress = v; if (state.playing) stopPlay(); render() },
  })

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:2px'
  playBtn = document.createElement('button')
  playBtn.className = 'btn'; playBtn.textContent = '▶  Play'
  playBtn.addEventListener('click', () => { if (state.playing) stopPlay(); else startPlay() })
  const resetBtn = document.createElement('button')
  resetBtn.className = 'btn'; resetBtn.textContent = '↺  Reset'
  resetBtn.addEventListener('click', () => { stopPlay(); state.progress = 0; progSl.setValue(0); render() })
  btnRow.append(playBtn, resetBtn)
  el.appendChild(btnRow)

  addDivider(el)

  const mkToggle = (label, key) => {
    const wrap = document.createElement('label')
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.82rem;cursor:pointer;color:var(--text-muted);user-select:none'
    const cb = document.createElement('input')
    cb.type = 'checkbox'; cb.checked = state[key]
    cb.addEventListener('change', () => { state[key] = cb.checked; render() })
    wrap.append(cb, document.createTextNode(label))
    el.appendChild(wrap)
  }
  mkToggle('Show prediction  RC(t²)', 'showPred')
  mkToggle('Show vector field  [X,Y]', 'showField')
}

buildControls()
resize()
