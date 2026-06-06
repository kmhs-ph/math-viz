import { GROUPS } from './groups.js'
import { getIrreps, characterTable } from './irreps.js'
import { Visualizer, randomProjection } from './viz.js'

// ── 상태 ──────────────────────────────────────────────────────────────────
const state = {
  groupKey: 'D3',
  irrepIdx: 0,
  composition: [],  // [{element, label}]
  currentElement: null,
}

let group = null
let irreps = []
let viz = null

// ── DOM 참조 ──────────────────────────────────────────────────────────────
const selGroup    = document.getElementById('sel-group')
const irrepList   = document.getElementById('irrep-list')
const charTable   = document.getElementById('char-table')
const genButtons  = document.getElementById('gen-buttons')
const compBox     = document.getElementById('composition-box')
const normalForm  = document.getElementById('normal-form')
const mainCanvas  = document.getElementById('main-canvas')
const vizTitle    = document.getElementById('viz-irrep-name')
const vizDim      = document.getElementById('viz-dim')
const matLabel    = document.getElementById('matrix-label')
const matDisplay  = document.getElementById('matrix-display')
const btnUndo     = document.getElementById('btn-undo')
const btnReset    = document.getElementById('btn-reset')
const edgePalette = document.getElementById('edge-palette')
const paletteBtns = edgePalette.querySelectorAll('.palette-btn')

// ── 팔레트 초기화 ────────────────────────────────────────────────────────
paletteBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const idx = parseInt(btn.dataset.idx)
    if (viz) viz.paletteIdx = idx
    paletteBtns.forEach(b => b.classList.toggle('active', b === btn))
  })
})

function resetPalette() {
  paletteBtns.forEach(b => b.classList.toggle('active', b.dataset.idx === '0'))
  if (viz) viz.paletteIdx = 0
}

function setPaletteVisible(dim) {
  edgePalette.style.display = dim >= 2 ? 'flex' : 'none'
  resetPalette()
}

// ── 군 선택 목록 초기화 ───────────────────────────────────────────────────
const GROUP_ORDER  = ['D3', 'D4', 'D5', 'D6', 'S3', 'S4', 'A3', 'A4', 'V4']
const GROUP_LABELS = {
  D3: 'D₃', D4: 'D₄', D5: 'D₅', D6: 'D₆',
  S3: 'S₃', S4: 'S₄',
  A3: 'A₃', A4: 'A₄',
  V4: 'V₄',
}
GROUP_ORDER.forEach(key => {
  if (!GROUPS[key]) return
  const opt = document.createElement('option')
  opt.value = key; opt.textContent = GROUP_LABELS[key] || key
  selGroup.appendChild(opt)
})

// ── 궤도 다면체 계산 ───────────────────────────────────────────────────────
function computeOrbit(irr, grp) {
  if (irr.dim === 1) return null
  const seen = new Set()
  const pts = []
  for (const elem of grp.elements) {
    const M = irr.getMatrix(grp, elem)
    // M * e₁ = first column of M
    const p = M.map(row => row[0])
    const key = p.map(v => Math.round(v * 1e4)).join(',')
    if (!seen.has(key)) { seen.add(key); pts.push(p) }
  }
  return pts
}

// ── 초기화 ────────────────────────────────────────────────────────────────
function init() {
  group = GROUPS[state.groupKey]
  if (!group) return
  irreps = getIrreps(state.groupKey, group)

  state.composition = []
  state.currentElement = group.elements[0]

  renderIrrepList()
  renderCharTable()
  renderGenButtons()
  renderComposition()

  if (state.irrepIdx >= irreps.length) state.irrepIdx = 0
  const irr = irreps[state.irrepIdx]

  if (viz) viz.destroy()
  viz = new Visualizer(mainCanvas)
  viz.init(irr.dim, computeOrbit(irr, group))
  setPaletteVisible(irr.dim)

  updateVizHeader(irr)
  updateMatrix()
}

// ── Irrep 목록 ────────────────────────────────────────────────────────────
function renderIrrepList() {
  irrepList.innerHTML = ''
  irreps.forEach((irr, i) => {
    const item = document.createElement('div')
    item.className = 'gr-irrep-item' + (i === state.irrepIdx ? ' active' : '')

    const name = document.createElement('span')
    name.className = 'gr-irrep-name'
    name.textContent = irr.name

    const dim = document.createElement('span')
    dim.className = 'gr-irrep-dim'
    dim.textContent = `${irr.dim}D`

    item.append(name, dim)
    item.addEventListener('click', () => selectIrrep(i))
    irrepList.appendChild(item)
  })
}

function selectIrrep(idx) {
  state.irrepIdx = idx
  const irr = irreps[idx]

  if (viz) viz.destroy()
  viz = new Visualizer(mainCanvas)
  viz.init(irr.dim, computeOrbit(irr, group))
  setPaletteVisible(irr.dim)

  updateVizHeader(irr)
  updateMatrix()
  applyCurrentElement()

  document.querySelectorAll('.gr-irrep-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx)
  })
}

// ── 지표표 ────────────────────────────────────────────────────────────────
function renderCharTable() {
  charTable.innerHTML = ''
  if (irreps.length === 0) return

  const { classes, table } = characterTable(group, irreps)
  charTable.style.gridTemplateColumns = `auto repeat(${classes.length}, auto)`

  const empty = document.createElement('span')
  empty.className = 'ct-header'; empty.textContent = ''
  charTable.appendChild(empty)

  classes.forEach(cls => {
    const span = document.createElement('span')
    span.className = 'ct-header'; span.textContent = cls
    charTable.appendChild(span)
  })

  table.forEach(row => {
    const nameEl = document.createElement('span')
    nameEl.className = 'ct-name'; nameEl.textContent = row.name
    charTable.appendChild(nameEl)

    row.chars.forEach(ch => {
      const span = document.createElement('span')
      span.className = 'ct-val'
      span.textContent = typeof ch === 'number' ? (Math.round(ch * 10) / 10).toString() : ch
      charTable.appendChild(span)
    })
  })
}

// ── 생성원 버튼 ───────────────────────────────────────────────────────────
function renderGenButtons() {
  genButtons.innerHTML = ''
  const eBtn = document.createElement('button')
  eBtn.className = 'gr-gen-btn'; eBtn.textContent = 'e'
  eBtn.addEventListener('click', () => {
    state.composition = []
    state.currentElement = group.elements[0]
    renderComposition(); applyCurrentElement()
  })
  genButtons.appendChild(eBtn)

  group.generators.forEach(gen => {
    const btn = document.createElement('button')
    btn.className = 'gr-gen-btn'
    btn.textContent = group.genLabels[group.id(gen)] || group.elementLabel(gen)
    btn.addEventListener('click', () => appendGen(gen))
    genButtons.appendChild(btn)
  })
}

function appendGen(gen) {
  if (!state.currentElement) state.currentElement = group.elements[0]
  const newElem = group.multiply(gen, state.currentElement)
  const genLabel = group.genLabels[group.id(gen)] || group.elementLabel(gen)
  state.composition.push({ element: gen, label: genLabel })
  state.currentElement = newElem
  renderComposition()
  applyCurrentElement()
}

// ── 구성 표시 ─────────────────────────────────────────────────────────────
function renderComposition() {
  compBox.innerHTML = ''
  if (state.composition.length === 0) {
    const span = document.createElement('span')
    span.style.color = 'var(--text-muted)'; span.textContent = 'e'
    compBox.appendChild(span); normalForm.textContent = 'e'; return
  }

  ;[...state.composition].reverse().forEach((item, i) => {
    if (i > 0) {
      const dot = document.createElement('span')
      dot.className = 'op-dot'; dot.textContent = ' · '
      compBox.appendChild(dot)
    }
    const span = document.createElement('span')
    span.textContent = item.label; compBox.appendChild(span)
  })

  normalForm.textContent = group.elementLabel(state.currentElement)
}

// ── 행렬 적용 및 시각화 업데이트 ─────────────────────────────────────────
function applyCurrentElement() {
  const irr = irreps[state.irrepIdx]
  if (!irr || !state.currentElement || !viz) return
  const M = irr.getMatrix(group, state.currentElement)
  viz.setTarget(M)
  updateMatrix()
}

function updateMatrix() {
  const irr = irreps[state.irrepIdx]
  if (!irr || !state.currentElement) return

  const M = irr.getMatrix(group, state.currentElement)
  const elemLabel = group.elementLabel(state.currentElement)
  matLabel.textContent = `ρ(${elemLabel})`

  matDisplay.innerHTML = ''
  const { dim } = irr

  const fmt = v => {
    const r = Math.round(v * 100) / 100
    return r === 0 ? '0' : r.toString()
  }

  if (dim === 1) {
    const span = document.createElement('span')
    span.className = 'gr-matrix-scalar'
    span.textContent = fmt(M[0][0])
    matDisplay.appendChild(span)
    return
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'gr-matrix-wrapper'
  const bL = document.createElement('div')
  bL.className = 'gr-matrix-bracket gr-matrix-bracket-l'
  const entries = document.createElement('div')
  entries.className = 'gr-matrix-entries'
  entries.style.gridTemplateColumns = `repeat(${dim}, auto)`

  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      const cell = document.createElement('span')
      cell.className = 'gr-matrix-cell'
      cell.textContent = fmt(M[i][j])
      entries.appendChild(cell)
    }

  const bR = document.createElement('div')
  bR.className = 'gr-matrix-bracket gr-matrix-bracket-r'
  wrapper.append(bL, entries, bR)
  matDisplay.appendChild(wrapper)
}

function updateVizHeader(irr) {
  vizTitle.textContent = irr.name
  vizDim.textContent = `dim = ${irr.dim}`
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────
selGroup.addEventListener('change', () => {
  state.groupKey = selGroup.value
  init()
})

btnUndo.addEventListener('click', () => {
  if (state.composition.length === 0) return
  state.composition.pop()
  let elem = group.elements[0]
  state.composition.forEach(item => { elem = group.multiply(item.element, elem) })
  state.currentElement = elem
  renderComposition(); applyCurrentElement()
})

btnReset.addEventListener('click', () => {
  state.composition = []
  state.currentElement = group.elements[0]
  renderComposition()
  if (viz) viz.reset()
  updateMatrix()
})

document.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P') {
    if (viz && irreps[state.irrepIdx]?.dim >= 4) {
      viz.projection = randomProjection(irreps[state.irrepIdx].dim)
    }
  }
})

// ── 시작 ─────────────────────────────────────────────────────────────────
init()
