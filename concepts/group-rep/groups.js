// ─── 행렬 유틸 ─────────────────────────────────────────────────────────────

export function matMul(A, B) {
  const n = A.length, m = B[0].length, k = B.length
  const C = Array.from({ length: n }, () => Array(m).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j]
  return C
}

export function matMulC(A, B) {
  // 복소 행렬 곱: 각 원소는 {re, im}
  const n = A.length, m = B[0].length, k = B.length
  const C = Array.from({ length: n }, () =>
    Array.from({ length: m }, () => ({ re: 0, im: 0 }))
  )
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      for (let l = 0; l < k; l++) {
        C[i][j].re += A[i][l].re * B[l][j].re - A[i][l].im * B[l][j].im
        C[i][j].im += A[i][l].re * B[l][j].im + A[i][l].im * B[l][j].re
      }
  return C
}

export function identityR(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )
}

export function identityC(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 }))
  )
}

// ─── D_n (이면군) ──────────────────────────────────────────────────────────
// 원소 표현: { flip: bool, rot: int (0..n-1) }
// 곱셈 규칙: srs^{-1} = r^{-1}  →  s·r^k = r^{-k}·s
// 즉 r^a · r^b = r^{(a+b) mod n}
//    r^a · (s·r^b) = s · r^{(b-a) mod n}
//    (s·r^a) · r^b = s · r^{(a+b) mod n}
//    (s·r^a) · (s·r^b) = r^{(b-a) mod n}   (since s^2 = e)

function dnElements(n) {
  const elems = []
  for (let k = 0; k < n; k++) elems.push({ flip: false, rot: k })
  for (let k = 0; k < n; k++) elems.push({ flip: true, rot: k })
  return elems
}

function dnMul(a, b, n) {
  if (!a.flip && !b.flip) return { flip: false, rot: (a.rot + b.rot) % n }
  if (!a.flip && b.flip)  return { flip: true,  rot: (b.rot - a.rot + n) % n }
  if (a.flip  && !b.flip) return { flip: true,  rot: (a.rot + b.rot) % n }
  // a.flip && b.flip
  return { flip: false, rot: (b.rot - a.rot + n) % n }
}

function dnLabel(e, n) {
  if (!e.flip) {
    if (e.rot === 0) return 'e'
    if (e.rot === 1) return 'r'
    if (e.rot === n - 1) return 'r⁻¹'
    return 'r' + superscript(e.rot)
  } else {
    if (e.rot === 0) return 's'
    if (e.rot === 1) return 'sr'
    return 'sr' + superscript(e.rot)
  }
}

function dnId(e) { return (e.flip ? 's' : 'r') + e.rot }
function dnFromId(id) {
  const flip = id[0] === 's'
  const rot = parseInt(id.slice(1))
  return { flip, rot }
}

// ─── S_n (대칭군, n=3 또는 4) ─────────────────────────────────────────────
// 원소 표현: permutation array (0-indexed)

function snElements(n) {
  return permutations(Array.from({ length: n }, (_, i) => i))
}

function permutations(arr) {
  if (arr.length <= 1) return [arr]
  const result = []
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i)
    for (const perm of permutations(rest))
      result.push([arr[i], ...perm])
  }
  return result
}

function snMul(a, b) {
  // (a ∘ b)(i) = a(b(i))
  return b.map(bi => a[bi])
}

function snLabel(perm) {
  // 사이클 표기
  const n = perm.length
  const visited = new Array(n).fill(false)
  const cycles = []
  for (let i = 0; i < n; i++) {
    if (visited[i] || perm[i] === i) { visited[i] = true; continue }
    const cycle = []
    let j = i
    while (!visited[j]) { visited[j] = true; cycle.push(j + 1); j = perm[j] }
    if (cycle.length > 1) cycles.push('(' + cycle.join('') + ')')
  }
  return cycles.length === 0 ? 'e' : cycles.join('')
}

function snId(perm) { return perm.join(',') }

function snSign(perm) {
  // 치환의 부호 = (-1)^{치환의 역위 수}
  let inv = 0
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++)
      if (perm[i] > perm[j]) inv++
  return inv % 2 === 0 ? 1 : -1
}

// ─── A_n (교대군, n=3 또는 4) ────────────────────────────────────────────

function anElements(n) {
  return snElements(n).filter(p => snSign(p) === 1)
}

// ─── V_4 (클라인 사군) ─────────────────────────────────────────────────────
// 원소: { a: 0|1, b: 0|1 }

function v4Elements() {
  return [
    { a: 0, b: 0 },  // e
    { a: 1, b: 0 },  // a
    { a: 0, b: 1 },  // b
    { a: 1, b: 1 },  // ab
  ]
}

function v4Mul(x, y) {
  return { a: (x.a + y.a) % 2, b: (x.b + y.b) % 2 }
}

function v4Label(e) {
  if (e.a === 0 && e.b === 0) return 'e'
  if (e.a === 1 && e.b === 0) return 'a'
  if (e.a === 0 && e.b === 1) return 'b'
  return 'ab'
}

function v4Id(e) { return `${e.a}${e.b}` }

// ─── 위첨자 유틸 ─────────────────────────────────────────────────────────

function superscript(n) {
  const map = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' }
  return String(n).split('').map(c => map[c] || c).join('')
}

// ─── 군 정의 ─────────────────────────────────────────────────────────────
// 각 군 객체는 다음을 제공:
//   elements: Array (각 원소는 임의 JS 객체)
//   multiply(a, b): 원소 → 원소
//   label(e): 표시용 문자열
//   id(e): 고유 문자열 키
//   generators: 원소 배열
//   genLabels: 생성원 → 표시명

function buildMulTable(elements, multiply, idFn) {
  const idx = {}
  elements.forEach((e, i) => { idx[idFn(e)] = i })
  const table = elements.map(a =>
    elements.map(b => idx[idFn(multiply(a, b))])
  )
  return { table, idx }
}

function makeGroup({ key, label, elements, multiply, idFn, labelFn, generators, genLabels }) {
  const { table, idx } = buildMulTable(elements, multiply, idFn)
  return {
    key, label, elements, generators, genLabels,
    label: labelFn,
    id: idFn,
    mulTable: table,
    elemIdx: idx,
    multiply(a, b) {
      return elements[table[idx[idFn(a)]][idx[idFn(b)]]]
    },
    inverse(a) {
      const identity = elements.find(e => idFn(multiply(a, e)) === idFn(elements[0]))
      return identity
    },
  }
}

// ─── 공개 군 목록 ────────────────────────────────────────────────────────

function makeDn(n) {
  const elems = dnElements(n)
  const identity = elems[0]
  const r = elems[1]                    // flip=false, rot=1
  const s = elems[n]                    // flip=true,  rot=0
  const gens = [r, s]
  const genLbls = {}
  genLbls[dnId(r)] = 'r'
  genLbls[dnId(s)] = 's'

  return makeGroup({
    key: `D${n}`,
    label: `D₍${n}₎`,
    elements: elems,
    multiply: (a, b) => dnFromId(dnId({ flip: false, rot: 0 })) === dnId(dnMul(a, b, n))
      ? dnMul(a, b, n) : dnMul(a, b, n),
    idFn: dnId,
    labelFn: e => dnLabel(e, n),
    generators: gens,
    genLabels: genLbls,
  })
}

// V_4 as subgroup of S_4 (Klein four-group)
function makeV4() {
  const elems = v4Elements()
  return makeGroup({
    key: 'V4',
    label: 'V₄',
    elements: elems,
    multiply: v4Mul,
    idFn: v4Id,
    labelFn: v4Label,
    generators: [elems[1], elems[2]],   // a, b
    genLabels: { '10': 'a', '01': 'b' },
  })
}

function makeSn(n) {
  const elems = snElements(n)
  const e = elems.find(p => snId(p) === snId(Array.from({ length: n }, (_, i) => i)))
  // generators: 인접 교환 (i, i+1)
  const gens = []
  const genLbls = {}
  for (let i = 0; i < n - 1; i++) {
    const t = Array.from({ length: n }, (_, j) => j)
    ;[t[i], t[i + 1]] = [t[i + 1], t[i]]
    gens.push(t)
    genLbls[snId(t)] = `(${i + 1}${i + 2})`
  }
  return makeGroup({
    key: `S${n}`,
    label: `S₍${n}₎`,
    elements: elems,
    multiply: snMul,
    idFn: snId,
    labelFn: snLabel,
    generators: gens,
    genLabels: genLbls,
  })
}

function makeAn(n) {
  const elems = anElements(n)
  // A_3 ≅ Z_3: generator = (123)
  // A_4: generators = (123), (124)
  const gens = []
  const genLbls = {}
  if (n === 3) {
    const r = elems.find(p => snLabel(p) === '(123)')
    gens.push(r)
    genLbls[snId(r)] = '(123)'
  } else if (n === 4) {
    const r1 = elems.find(p => snLabel(p) === '(123)')
    const r2 = elems.find(p => snLabel(p) === '(124)')
    gens.push(r1, r2)
    genLbls[snId(r1)] = '(123)'
    genLbls[snId(r2)] = '(124)'
  }
  return makeGroup({
    key: `A${n}`,
    label: `A₍${n}₎`,
    elements: elems,
    multiply: snMul,
    idFn: snId,
    labelFn: snLabel,
    generators: gens,
    genLabels: genLbls,
  })
}

// D_n를 multiply 함수가 올바른 클로저를 사용하도록 재구현
function makeDnFixed(n) {
  const elems = dnElements(n)
  const mul = (a, b) => dnMul(a, b, n)
  const { table, idx } = buildMulTable(elems, mul, dnId)
  const r = elems[1]
  const s = elems[n]
  const genLbls = {}
  genLbls[dnId(r)] = 'r'
  genLbls[dnId(s)] = 's'

  return {
    key: `D${n}`,
    label: `D${n}`,
    elements: elems,
    generators: [r, s],
    genLabels: genLbls,
    id: dnId,
    elementLabel: e => dnLabel(e, n),
    mulTable: table,
    elemIdx: idx,
    multiply(a, b) { return elems[table[idx[dnId(a)]][idx[dnId(b)]]] },
  }
}

function makeGroupFixed({ key, label, elements, multiplyFn, idFn, labelFn, generators, genLabels }) {
  const { table, idx } = buildMulTable(elements, multiplyFn, idFn)
  return {
    key, label, elements, generators, genLabels,
    id: idFn,
    elementLabel: labelFn,
    mulTable: table,
    elemIdx: idx,
    multiply(a, b) { return elements[table[idx[idFn(a)]][idx[idFn(b)]]] },
  }
}

export const GROUPS = {}

// D_n (n=3..6)
for (let n = 3; n <= 6; n++) {
  const g = makeDnFixed(n)
  GROUPS[g.key] = g
}

// S_3, S_4
for (const n of [3, 4]) {
  const elems = snElements(n)
  const gens = []
  const genLbls = {}
  for (let i = 0; i < n - 1; i++) {
    const t = Array.from({ length: n }, (_, j) => j)
    ;[t[i], t[i + 1]] = [t[i + 1], t[i]]
    gens.push(t)
    genLbls[snId(t)] = `(${i+1}${i+2})`
  }
  GROUPS[`S${n}`] = makeGroupFixed({
    key: `S${n}`,
    label: `S${n}`,
    elements: elems,
    multiplyFn: snMul,
    idFn: snId,
    labelFn: snLabel,
    generators: gens,
    genLabels: genLbls,
  })
}

// A_3, A_4
for (const n of [3, 4]) {
  const elems = anElements(n)
  const g = makeGroupFixed({
    key: `A${n}`,
    label: `A${n}`,
    elements: elems,
    multiplyFn: snMul,
    idFn: snId,
    labelFn: snLabel,
    generators: [],
    genLabels: {},
  })
  const genLbls = {}
  if (n === 3) {
    const r = elems.find(p => snLabel(p) === '(123)')
    g.generators = [r]
    genLbls[snId(r)] = '(123)'
  } else {
    const r1 = elems.find(p => snLabel(p) === '(123)')
    const r2 = elems.find(p => snLabel(p) === '(124)')
    if (r1 && r2) { g.generators = [r1, r2]; genLbls[snId(r1)] = '(123)'; genLbls[snId(r2)] = '(124)' }
  }
  g.genLabels = genLbls
  GROUPS[g.key] = g
}

// V_4
{
  const elems = v4Elements()
  const g = makeGroupFixed({
    key: 'V4',
    label: 'V₄',
    elements: elems,
    multiplyFn: v4Mul,
    idFn: v4Id,
    labelFn: v4Label,
    generators: [elems[1], elems[2]],
    genLabels: { '10': 'a', '01': 'b' },
  })
  GROUPS['V4'] = g
}

export { snSign }
