import { resizeCanvas } from '../../shared/canvas-utils.js'
import { createSlider, createSelect, createButton, addDivider } from '../../shared/controls.js'

// ── 푸리에 계수 정의 ────────────────────────────────────────────────────────
const WAVEFORMS = {
  square: {
    label: '사각파',
    // 홀수 배음만: aₙ = 4/(nπ)
    coeff: n => (n % 2 !== 0) ? 4 / (n * Math.PI) : 0,
  },
  sawtooth: {
    label: '톱니파',
    coeff: n => (2 * Math.pow(-1, n + 1)) / (n * Math.PI),
  },
  triangle: {
    label: '삼각파',
    coeff: n => {
      if (n % 2 === 0) return 0
      return (Math.pow(-1, (n - 1) / 2) * 8) / (n * n * Math.PI * Math.PI)
    },
  },
}

// ── 상태 ──────────────────────────────────────────────────────────────────
const state = {
  N: 8,
  speed: 1.0,
  waveform: 'square',
  paused: false,
  time: 0,
  trail: [],
  maxTrailLen: 700,
}

// ── Canvas 설정 ───────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
let W = 0, H = 0

function resize() {
  resizeCanvas(canvas)
  const r = canvas.parentElement.getBoundingClientRect()
  W = r.width
  H = r.height
  state.trail = []
}

// ── 에피사이클 목록 계산 ────────────────────────────────────────────────────
function getCircles() {
  const wf = WAVEFORMS[state.waveform]
  const circles = []
  for (let n = 1; n <= state.N; n++) {
    const a = wf.coeff(n)
    if (a === 0) continue
    circles.push({ n, r: Math.abs(a), sign: Math.sign(a) })
  }
  circles.sort((a, b) => b.r - a.r)
  return circles
}

// ── 그리기 ────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H)

  const splitX = W * 0.44
  const waveStartX = splitX + 16
  const cy = H / 2

  // 분리선
  ctx.beginPath()
  ctx.moveTo(splitX, 0)
  ctx.lineTo(splitX, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 에피사이클 영역 좌표 원점
  const ox = splitX / 2
  const oy = cy

  const circles = getCircles()
  if (circles.length === 0) return

  // 가장 큰 원의 반지름을 기준으로 스케일 계산
  const maxR = circles[0].r
  const scale = (Math.min(splitX, H) * 0.38) / maxR

  // 좌표축
  ctx.beginPath()
  ctx.moveTo(0, oy); ctx.lineTo(splitX, oy)
  ctx.moveTo(ox, 0); ctx.lineTo(ox, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 에피사이클 그리기
  let x = ox, y = oy
  circles.forEach(c => {
    const r = c.r * scale
    // sign이 음수면 위상 π 반전
    const angle = c.n * state.time + (c.sign < 0 ? Math.PI : 0)
    const nx = x + r * Math.cos(angle)
    const ny = y + r * Math.sin(angle)

    // 원
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(91,141,238,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 암(arm)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.strokeStyle = 'rgba(91,141,238,0.85)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    x = nx; y = ny
  })

  // 끝점 점
  ctx.beginPath()
  ctx.arc(x, y, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // 궤적 기록
  state.trail.unshift({ x, y })
  if (state.trail.length > state.maxTrailLen) state.trail.length = state.maxTrailLen

  // 파형 전개
  const trailStep = (W - waveStartX - 8) / state.maxTrailLen

  // 연결선 (끝점 → 파형 첫 점)
  if (state.trail.length > 0) {
    const wx0 = waveStartX
    const wy0 = cy + state.trail[0].y - oy
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(wx0, wy0)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 파형 경로
  if (state.trail.length > 1) {
    ctx.beginPath()
    state.trail.forEach((pt, i) => {
      const wx = waveStartX + i * trailStep
      const wy = cy + pt.y - oy
      if (i === 0) ctx.moveTo(wx, wy)
      else ctx.lineTo(wx, wy)
    })
    ctx.strokeStyle = '#5b8dee'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // 파형 영역 수평 축
  ctx.beginPath()
  ctx.moveTo(waveStartX, cy)
  ctx.lineTo(W, cy)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ctx.stroke()
}

// ── 애니메이션 루프 ────────────────────────────────────────────────────────
let lastTs = null

function loop(ts) {
  requestAnimationFrame(loop)
  if (lastTs === null) { lastTs = ts; return }
  const dt = Math.min((ts - lastTs) / 1000, 0.05)
  lastTs = ts

  if (!state.paused) state.time += dt * state.speed
  draw()
}

// ── 컨트롤 UI ─────────────────────────────────────────────────────────────
const controlsEl = document.getElementById('controls')

createSlider({
  container: controlsEl,
  label: '항의 수 N',
  min: 1, max: 50, step: 1, value: state.N,
  format: v => Math.round(v),
  onChange: v => { state.N = Math.round(v); state.trail = [] },
})

createSlider({
  container: controlsEl,
  label: '속도',
  min: 0.1, max: 5, step: 0.1, value: state.speed,
  format: v => v.toFixed(1) + '×',
  onChange: v => { state.speed = v },
})

createSelect({
  container: controlsEl,
  label: '파형',
  options: Object.entries(WAVEFORMS).map(([value, { label }]) => ({ value, label })),
  value: state.waveform,
  onChange: v => { state.waveform = v; state.trail = []; state.time = 0 },
})

addDivider(controlsEl)

const pauseBtn = createButton({
  container: controlsEl,
  label: '일시정지',
  onClick: () => {
    state.paused = !state.paused
    pauseBtn.textContent = state.paused ? '▶ 재생' : '일시정지'
  },
})

createButton({
  container: controlsEl,
  label: '초기화',
  onClick: () => { state.trail = []; state.time = 0 },
})

// ── 시작 ─────────────────────────────────────────────────────────────────
resize()
window.addEventListener('resize', resize)
requestAnimationFrame(loop)
