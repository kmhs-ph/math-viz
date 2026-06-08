import { createSlider, createSelect, addDivider } from '../../shared/controls.js'

// ── SO(3) math ────────────────────────────────────────────────────────────────

const I3 = [[1,0,0],[0,1,0],[0,0,1]]

function mul3(A, B) {
  return A.map((_, i) => [0,1,2].map(j =>
    A[i].reduce((s, _, k) => s + A[i][k]*B[k][j], 0)))
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

const PAIRS = {
  xy: { label:'Lx, Ly  →  [Lx,Ly] = Lz', RA:Rx, RB:Ry, RC:Rz,
        field:([x,y  ]) => [-y,  x,  0], fieldLabel:'Lz = [Lx,Ly]' },
  yz: { label:'Ly, Lz  →  [Ly,Lz] = Lx', RA:Ry, RB:Rz, RC:Rx,
        field:([ ,y,z]) => [ 0, -z,  y], fieldLabel:'Lx = [Ly,Lz]' },
  zx: { label:'Lz, Lx  →  [Lz,Lx] = Ly', RA:Rz, RB:Rx, RC:Ry,
        field:([x, ,z]) => [ z,  0, -x], fieldLabel:'Ly = [Lz,Lx]' },
}

// ── Commutator steps ──────────────────────────────────────────────────────────

function getStepMs(t, pair) {
  const {RA,RB} = pair
  const M1 = RB(-t), M2 = mul3(RA(-t),M1), M3 = mul3(RB(t),M2), M4 = mul3(RA(t),M3)
  return [I3, M1, M2, M3, M4]
}

function interpM(p, t, pair) {
  const {RA,RB} = pair, [,M1,M2,M3] = getStepMs(t,pair)
  if (p <= 0) return I3
  if (p <= 1) return RB(-p*t)
  if (p <= 2) return mul3(RA(-(p-1)*t), M1)
  if (p <= 3) return mul3(RB( (p-2)*t), M2)
  if (p <= 4) return mul3(RA( (p-3)*t), M3)
  return getStepMs(t,pair)[4]
}

// ── Symbol on sphere ──────────────────────────────────────────────────────────
// F-shape in tangent plane (radians). Stem on west, openings to east.

const SYM_POLY = [
  [-0.08,-0.13],[-0.03,-0.13],[-0.03,-0.02],
  [ 0.07,-0.02],[ 0.07, 0.03],[-0.03, 0.03],
  [-0.03, 0.08],[ 0.10, 0.08],[ 0.10, 0.13],
  [-0.08, 0.13],
]

const ANCHOR_LAT = 25, ANCHOR_LON = 35  // degrees

function symPts3D(M) {
  const la = ANCHOR_LAT*Math.PI/180, lo = ANCHOR_LON*Math.PI/180
  const p0 = [Math.cos(la)*Math.cos(lo), Math.cos(la)*Math.sin(lo), Math.sin(la)]
  const eE = [-Math.sin(lo), Math.cos(lo), 0]
  const eN = [-Math.sin(la)*Math.cos(lo), -Math.sin(la)*Math.sin(lo), Math.cos(la)]
  return SYM_POLY.map(([u,v]) => {
    const p = [p0[0]+u*eE[0]+v*eN[0], p0[1]+u*eE[1]+v*eN[1], p0[2]+u*eE[2]+v*eN[2]]
    return apply3(M, p.map(x => x/Math.hypot(...p)))
  })
}

function drawSym(M, Rcam, cx, cy, sc, rgb, alpha, filled) {
  const sPts = symPts3D(M).map(p => {
    const [qx,qy,qz] = apply3(Rcam, p)
    return { sx: cx+qx*sc, sy: cy-qy*sc, depth: qz }
  })
  const avgD = sPts.reduce((s,p) => s+p.depth, 0) / sPts.length
  if (avgD < -0.10) return
  const a = alpha * (avgD < 0.08 ? Math.max(0,(avgD+0.10)/0.18) : 1)
  if (a < 0.01) return

  ctx.beginPath()
  ctx.moveTo(sPts[0].sx, sPts[0].sy)
  for (let i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i].sx, sPts[i].sy)
  ctx.closePath()
  if (filled) { ctx.fillStyle=`rgba(${rgb},${a.toFixed(2)})`; ctx.fill() }
  ctx.strokeStyle=`rgba(${rgb},${Math.min(1,a*1.3).toFixed(2)})`
  ctx.lineWidth=2; ctx.setLineDash([]); ctx.stroke()
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = { pairKey:'xy', t:0.6, progress:0.0, playing:false, showField:true, showPred:true }
const cam   = { az:0.45, el:0.35 }

// ── Canvas ────────────────────────────────────────────────────────────────────

const CV  = document.getElementById('la-canvas')
const ctx = CV.getContext('2d')
let raf   = null

function resize() {
  const dpr = window.devicePixelRatio || 1
  CV.width=CV.clientWidth*dpr; CV.height=CV.clientHeight*dpr
  ctx.setTransform(dpr,0,0,dpr,0,0); render()
}
window.addEventListener('resize', resize)

let drag = null
CV.addEventListener('mousedown', e => { drag={x:e.clientX,y:e.clientY,az:cam.az,el:cam.el} })
window.addEventListener('mousemove', e => {
  if (!drag) return
  cam.az = drag.az + (e.clientX-drag.x)*0.008
  cam.el = Math.max(-1.3, Math.min(1.3, drag.el-(e.clientY-drag.y)*0.008))
  render()
})
window.addEventListener('mouseup', () => { drag=null })

function camMatrix() { return mul3(Ry(cam.az), Rx(-cam.el)) }

// ── Sphere + axes drawing ─────────────────────────────────────────────────────

function drawSmoothSphere(cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2*Math.PI)
  const g = ctx.createRadialGradient(cx-r*0.28, cy-r*0.28, r*0.04, cx, cy, r)
  g.addColorStop(0.0, 'rgba(50,62,105,0.96)')
  g.addColorStop(0.5, 'rgba(18,22,50,0.97)')
  g.addColorStop(1.0, 'rgba(5,7,18,0.99)')
  ctx.fillStyle=g; ctx.fill()
  // specular highlight
  const h = ctx.createRadialGradient(cx-r*0.32,cy-r*0.32,0,cx-r*0.32,cy-r*0.32,r*0.38)
  h.addColorStop(0,'rgba(155,175,255,0.13)'); h.addColorStop(1,'rgba(155,175,255,0)')
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.fillStyle=h; ctx.fill()
  ctx.strokeStyle='rgba(90,120,210,0.20)'; ctx.lineWidth=1.5; ctx.stroke()
}

function drawAxis(dir, label, rgb, Rcam, cx, cy, sc) {
  const L = 1.38
  // Outside-sphere segments only: [-L,-1] and [1,L]
  for (const [t0,t1] of [[-L,-1],[1,L]]) {
    const a = (() => { const [qx,qy,qz]=apply3(Rcam,dir.map(d=>d*t0)); return {sx:cx+qx*sc,sy:cy-qy*sc,depth:qz} })()
    const b = (() => { const [qx,qy,qz]=apply3(Rcam,dir.map(d=>d*t1)); return {sx:cx+qx*sc,sy:cy-qy*sc,depth:qz} })()
    const alpha = (a.depth+b.depth)/2 > 0 ? 0.65 : 0.08
    ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy)
    ctx.strokeStyle=`rgba(${rgb},${alpha})`; ctx.lineWidth=1.4
    ctx.setLineDash([4,3]); ctx.stroke()
  }
  ctx.setLineDash([])
  const tipF = (() => { const [qx,qy,qz]=apply3(Rcam,dir.map(d=>d*L)); return {sx:cx+qx*sc,sy:cy-qy*sc,depth:qz} })()
  const tipB = (() => { const [qx,qy,qz]=apply3(Rcam,dir.map(d=>-d*L)); return {sx:cx+qx*sc,sy:cy-qy*sc,depth:qz} })()
  const tip  = tipF.depth > tipB.depth ? tipF : tipB
  ctx.fillStyle=`rgba(${rgb},0.82)`; ctx.font='13px "JetBrains Mono",monospace'
  ctx.fillText(label, tip.sx+5, tip.sy-3)
}

function drawVField(pair, Rcam, cx, cy, sc, alpha) {
  const LATS=[-60,-30,0,30,60], LONS=[0,45,90,135,180,225,270,315]
  for (const la of LATS) {
    for (const lo of LONS) {
      const la_r=la*Math.PI/180, lo_r=lo*Math.PI/180
      const p=[Math.cos(la_r)*Math.cos(lo_r),Math.cos(la_r)*Math.sin(lo_r),Math.sin(la_r)]
      const raw=pair.field(p), len=Math.hypot(...raw)
      if (len<0.01) continue
      const v=raw.map(c=>c/len*0.18), ep=[p[0]+v[0],p[1]+v[1],p[2]+v[2]]
      const [aqx,aqy,aqz]=apply3(Rcam,p),  a={sx:cx+aqx*sc,sy:cy-aqy*sc,depth:aqz}
      const [bqx,bqy,bqz]=apply3(Rcam,ep), b={sx:cx+bqx*sc,sy:cy-bqy*sc,depth:bqz}
      if (a.depth < 0.02) continue
      const dx=b.sx-a.sx,dy=b.sy-a.sy,dl=Math.hypot(dx,dy)
      if (dl<3) continue
      const ux=dx/dl,uy=dy/dl,hw=3,hl=7
      const col=`rgba(72,215,130,${(alpha*0.90).toFixed(2)})`
      ctx.save()
      ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1.5; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx-ux*hl,b.sy-uy*hl); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.sx,b.sy)
      ctx.lineTo(b.sx-ux*hl-uy*hw,b.sy-uy*hl+ux*hw)
      ctx.lineTo(b.sx-ux*hl+uy*hw,b.sy-uy*hl-ux*hw)
      ctx.closePath(); ctx.fill(); ctx.restore()
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

const STEP_RGB = ['210,210,230','70,155,255','155,70,255','255,148,55','255,75,75']
const STEP_HEX = ['#d2d2e6','#469bff','#9b46ff','#ff943a','#ff4b4b']
const STEP_LAB = ['I','Rb(−t)','Ra(−t)Rb(−t)','Rb(t)Ra(−t)Rb(−t)','commutator']

let progSl=null, playBtn=null

function render() {
  const W=CV.clientWidth, H=CV.clientHeight
  ctx.clearRect(0,0,W,H)

  const pair=PAIRS[state.pairKey], t=state.t, p=state.progress
  const f=Math.min(Math.floor(p),4)
  const Rcam=camMatrix(), sc=Math.min(W,H)*0.36, cx=W/2, cy=H/2

  const Mcur  = interpM(p,t,pair)
  const M4    = getStepMs(t,pair)[4]
  const Mpred = pair.RC(t*t)

  // 1. Axes (drawn before sphere; outside-sphere portions only)
  drawAxis([1,0,0],'x','255,100,100',Rcam,cx,cy,sc)
  drawAxis([0,1,0],'y','100,215,100',Rcam,cx,cy,sc)
  drawAxis([0,0,1],'z','100,150,255',Rcam,cx,cy,sc)

  // 2. Smooth sphere
  drawSmoothSphere(cx, cy, sc)

  // 3. Ghost symbol at identity (outline only)
  drawSym(I3, Rcam, cx, cy, sc, '200,200,220', 0.50, false)

  // 4. Prediction symbol at RC(t²) (green outline, when p near 4)
  if (state.showPred && p >= 3.8) {
    const a = Math.min(1,(p-3.8)/0.3)
    drawSym(Mpred, Rcam, cx, cy, sc, '72,215,130', 0.75*a, false)
  }

  // 5. Current animated symbol (filled, step color)
  const curS = f < 4 ? f+1 : 4
  drawSym(Mcur, Rcam, cx, cy, sc, STEP_RGB[curS], 0.85, true)

  // 6. Vector field [X,Y] (fades in as p → 4)
  const fAlpha = state.showField ? Math.max(0,Math.min(1,(p-3.5)*2)) : 0
  if (fAlpha > 0.01) drawVField(pair, Rcam, cx, cy, sc, fAlpha)

  // 7. Legend
  ctx.font='11.5px "JetBrains Mono",monospace'
  let ly=24, lx=16
  const nShow=Math.min(Math.ceil(p)+1,5)
  for (let s=0;s<nShow;s++) {
    ctx.fillStyle=STEP_HEX[s]; ctx.fillRect(lx,ly-10,13,11)
    ctx.fillStyle='rgba(148,163,184,0.9)'; ctx.fillText(STEP_LAB[s],lx+17,ly); ly+=18
  }
  if (state.showPred && p>=3.8) {
    ctx.save(); ctx.setLineDash([5,4])
    ctx.strokeStyle='rgba(72,215,130,0.85)'; ctx.lineWidth=2
    ctx.beginPath(); ctx.moveTo(lx,ly-5); ctx.lineTo(lx+13,ly-5); ctx.stroke()
    ctx.restore()
    ctx.fillStyle='rgba(148,163,184,0.9)'; ctx.fillText('RC(t²) pred.',lx+17,ly); ly+=18
  }
  if (fAlpha>0.1) {
    ctx.fillStyle='rgba(72,215,130,0.85)'; ctx.fillRect(lx,ly-10,13,11)
    ctx.fillStyle='rgba(148,163,184,0.9)'; ctx.fillText(pair.fieldLabel,lx+17,ly); ly+=18
  }

  ctx.font='11px "JetBrains Mono",monospace'
  ctx.fillStyle='rgba(148,163,184,0.45)'; ctx.setLineDash([])
  ctx.fillText('t = '+t.toFixed(2)+'   drag to orbit',lx,H-12)
}

// ── Animation ─────────────────────────────────────────────────────────────────

let lastTs=null

function animate(ts) {
  if (!state.playing) return
  if (!lastTs) lastTs=ts
  const dt=(ts-lastTs)/1000; lastTs=ts
  state.progress=Math.min(4,state.progress+dt*0.8)
  progSl?.setValue(state.progress); render()
  if (state.progress<4) { raf=requestAnimationFrame(animate) }
  else { state.playing=false; lastTs=null; if(playBtn) playBtn.textContent='▶  Play' }
}

function startPlay() {
  if (state.progress>=4) { state.progress=0; progSl?.setValue(0) }
  state.playing=true; lastTs=null
  if(playBtn) playBtn.textContent='⏸  Pause'
  raf=requestAnimationFrame(animate)
}

function stopPlay() {
  state.playing=false; lastTs=null
  if(playBtn) playBtn.textContent='▶  Play'
  if(raf){cancelAnimationFrame(raf);raf=null}
}

// ── Controls ──────────────────────────────────────────────────────────────────

function buildControls() {
  const el=document.getElementById('la-controls')

  createSelect({
    container:el, label:'Generators',
    options:Object.entries(PAIRS).map(([v,p])=>({value:v,label:p.label})),
    value:state.pairKey,
    onChange:v=>{state.pairKey=v;render()},
  })

  createSlider({
    container:el, label:'t', min:0.05, max:1.6, step:0.05, value:state.t,
    format:v=>v.toFixed(2), onChange:v=>{state.t=v;render()},
  })

  addDivider(el)

  progSl=createSlider({
    container:el, label:'Step', min:0, max:4, step:0.01, value:state.progress,
    format:v=>v.toFixed(2),
    onChange:v=>{state.progress=v;if(state.playing)stopPlay();render()},
  })

  const row=document.createElement('div')
  row.style.cssText='display:flex;gap:8px;margin-top:2px'
  playBtn=document.createElement('button')
  playBtn.className='btn'; playBtn.textContent='▶  Play'
  playBtn.addEventListener('click',()=>{if(state.playing)stopPlay();else startPlay()})
  const rst=document.createElement('button')
  rst.className='btn'; rst.textContent='↺  Reset'
  rst.addEventListener('click',()=>{stopPlay();state.progress=0;progSl.setValue(0);render()})
  row.append(playBtn,rst); el.appendChild(row)

  addDivider(el)

  const mkToggle=(label,key)=>{
    const wrap=document.createElement('label')
    wrap.style.cssText='display:flex;align-items:center;gap:8px;font-size:0.82rem;cursor:pointer;color:var(--text-muted);user-select:none'
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state[key]
    cb.addEventListener('change',()=>{state[key]=cb.checked;render()})
    wrap.append(cb,document.createTextNode(label)); el.appendChild(wrap)
  }
  mkToggle('Show prediction  RC(t²)', 'showPred')
  mkToggle('Show vector field  [X,Y]', 'showField')
}

buildControls()
resize()
