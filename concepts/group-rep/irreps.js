import { GROUPS, matMul, matMulC, identityR, identityC, snSign } from './groups.js'

// ─── 행렬 헬퍼 ───────────────────────────────────────────────────────────────

function rot2(theta) {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [[c, -s], [s, c]]
}

function reflY() { return [[1, 0], [0, -1]] }   // 표준 반사 (x축 기준)

// 복소수 상수 편의 함수
function cx(re, im = 0) { return { re, im } }

// 실수 행렬을 복소 행렬로 (허부 0)
function toC(M) {
  return M.map(row => row.map(v => cx(v)))
}

// ─── Irrep 팩토리 ─────────────────────────────────────────────────────────
//
// 각 irrep 객체:
//   name: string
//   dim: int
//   field: 'R' | 'C'
//   charLabel: string (지표표 헤더용 이름)
//   genMatrices: { [genId]: Matrix }   — 생성원별 행렬 (R: number[][], C: {re,im}[][])
//   getMatrix(group, element): Matrix  — 임의 원소 행렬 (결과 캐시)
//
// getMatrix 공통 구현: 원소를 생성원 단어로 표현 → 행렬 곱

function buildIrrep({ name, dim, field, charLabel, genMatrices }) {
  const cache = new Map()

  function getMatrix(group, element) {
    const key = group.id(element)
    if (cache.has(key)) return cache.get(key)

    // 생성원 행렬 직접 매핑 시도
    if (genMatrices[key]) { cache.set(key, genMatrices[key]); return genMatrices[key] }

    // 생성원의 곱으로 원소를 분해 → BFS로 표현
    // 군의 원소 인덱스에서 생성원 단어를 BFS로 찾음
    const identity = group.elements[0]
    const idKey = group.id(identity)
    const I = field === 'R' ? identityR(dim) : identityC(dim)

    if (key === idKey) { cache.set(key, I); return I }

    // BFS: (element, accumulatedMatrix)
    const seen = new Map()
    seen.set(idKey, I)
    const queue = [[identity, I]]
    const mulFn = field === 'R' ? matMul : matMulC

    while (queue.length > 0) {
      const [cur, mat] = queue.shift()
      const curKey = group.id(cur)
      for (const gen of group.generators) {
        const next = group.multiply(cur, gen)
        const nextKey = group.id(next)
        if (!seen.has(nextKey)) {
          const genMat = genMatrices[group.id(gen)]
          const nextMat = mulFn(mat, genMat)
          seen.set(nextKey, nextMat)
          if (nextKey === key) { cache.set(key, nextMat); return nextMat }
          queue.push([next, nextMat])
        }
      }
    }

    // 역원 방향도 탐색 (생성원의 역원 = 생성원^{ord-1})
    // 이미 위에서 찾았어야 하지만 못 찾은 경우 identity 반환
    cache.set(key, I)
    return I
  }

  return { name, dim, field, charLabel: charLabel || name, genMatrices, getMatrix }
}

// ─── D_n irrep ────────────────────────────────────────────────────────────
// 생성원 id: r → 'r1' (flip=false, rot=1), s → 's0' (flip=true, rot=0)

function dnIrrepsR(n) {
  const irreps = []
  const rId = 'r1', sId = 's0'    // D_n에서 r = {flip:false,rot:1}, s = {flip:true,rot:0}

  // 1D: trivial
  irreps.push(buildIrrep({
    name: 'trivial', dim: 1, field: 'R', charLabel: 'χ₁',
    genMatrices: { [rId]: [[1]], [sId]: [[1]] },
  }))

  if (n % 2 === 1) {
    // n 홀수: 1D det
    irreps.push(buildIrrep({
      name: 'det', dim: 1, field: 'R', charLabel: 'χ₂',
      genMatrices: { [rId]: [[1]], [sId]: [[-1]] },
    }))
  } else {
    // n 짝수: 3개의 추가 1D irrep
    irreps.push(buildIrrep({
      name: 'det', dim: 1, field: 'R', charLabel: 'χ₂',
      genMatrices: { [rId]: [[1]], [sId]: [[-1]] },
    }))
    irreps.push(buildIrrep({
      name: "det'", dim: 1, field: 'R', charLabel: "χ₃",
      genMatrices: { [rId]: [[-1]], [sId]: [[1]] },
    }))
    irreps.push(buildIrrep({
      name: "det''", dim: 1, field: 'R', charLabel: "χ₄",
      genMatrices: { [rId]: [[-1]], [sId]: [[-1]] },
    }))
  }

  // 2D irreps: ρ_k for k=1..floor((n-1)/2)
  const limit = Math.floor((n - 1) / 2)
  for (let k = 1; k <= limit; k++) {
    const theta = 2 * Math.PI * k / n
    irreps.push(buildIrrep({
      name: k === 1 ? 'std' : `ρ${k}`,
      dim: 2, field: 'R',
      charLabel: k === 1 ? 'χ₂ᴰ' : `χ${k}ᴰ`,
      genMatrices: {
        [rId]: rot2(theta),
        [sId]: reflY(),
      },
    }))
  }

  return irreps
}

function dnIrrepsC(n) {
  const irreps = []
  const rId = 'r1', sId = 's0'

  // 모든 실수 irrep은 복소 irrep이기도 함
  for (const irr of dnIrrepsR(n)) {
    irreps.push(buildIrrep({
      name: irr.name,
      dim: irr.dim,
      field: 'C',
      charLabel: irr.charLabel,
      genMatrices: Object.fromEntries(
        Object.entries(irr.genMatrices).map(([k, M]) => [k, toC(M)])
      ),
    }))
  }

  // D_n에서 ℂ 위에서 추가로 분리되는 irrep 없음 (D_n은 항상 실수 irrep으로 충분)
  return irreps
}

// ─── V_4 irrep ───────────────────────────────────────────────────────────
// 생성원 id: a → '10', b → '01'

function v4IrrepsR() {
  const irreps = []
  const signs = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  const names = ['trivial', "χ_a", "χ_b", "χ_ab"]
  for (let i = 0; i < 4; i++) {
    const [sa, sb] = signs[i]
    irreps.push(buildIrrep({
      name: names[i], dim: 1, field: 'R', charLabel: `χ${i + 1}`,
      genMatrices: { '10': [[sa]], '01': [[sb]] },
    }))
  }
  return irreps
}

function v4IrrepsC() {
  return v4IrrepsR().map(irr => buildIrrep({
    name: irr.name, dim: 1, field: 'C', charLabel: irr.charLabel,
    genMatrices: Object.fromEntries(
      Object.entries(irr.genMatrices).map(([k, M]) => [k, toC(M)])
    ),
  }))
}

// ─── S_3 irrep (= D_3 이지만 S_n 생성원 id 사용) ─────────────────────────
// S_3 생성원: (12) = [1,0,2], (23) = [0,2,1]
// snId([1,0,2]) = '1,0,2', snId([0,2,1]) = '0,2,1'

function s3IrrepsR() {
  const tau1Id = '1,0,2', tau2Id = '0,2,1'
  // Standard 2D: (12) → reflection, (23) → different reflection
  // 표준 표현: (12) → [[1,0],[0,-1]] 기저에서의 반사
  // 실제로 S_3의 표준 2D irrep:
  // 기저: e1-e2, e2-e3 (3D에서 (1,1,1)⊥ 의 기저)
  // (12): [[-1,1],[0,1]]  (23): [[1,0],[1,-1]]
  const tau1_std = [[-1, 1], [0, 1]]
  const tau2_std = [[1, 0], [1, -1]]

  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'R', charLabel: 'χ₁',
      genMatrices: { [tau1Id]: [[1]], [tau2Id]: [[1]] },
    }),
    buildIrrep({
      name: 'sign', dim: 1, field: 'R', charLabel: 'χ₂',
      genMatrices: { [tau1Id]: [[-1]], [tau2Id]: [[-1]] },
    }),
    buildIrrep({
      name: 'std', dim: 2, field: 'R', charLabel: 'χ₃',
      genMatrices: { [tau1Id]: tau1_std, [tau2Id]: tau2_std },
    }),
  ]
}

function s3IrrepsC() {
  return s3IrrepsR().map(irr => buildIrrep({
    name: irr.name, dim: irr.dim, field: 'C', charLabel: irr.charLabel,
    genMatrices: Object.fromEntries(
      Object.entries(irr.genMatrices).map(([k, M]) => [k, toC(M)])
    ),
  }))
}

// ─── S_4 irrep ────────────────────────────────────────────────────────────
// 생성원: (12) id='1,0,2,3', (23) id='0,2,1,3', (34) id='0,1,3,2'
// S_4의 5개 irrep: trivial(1), sign(1), ρ₂(2), std(3), std⊗sign(3)
// 2D irrep: S_4 → S_4/V₄ ≅ S_3 을 통해 얻음
//   V₄ = {e, (12)(34), (13)(24), (14)(23)}
//   S_4/V₄ → S_3: σ ↦ σ restricted to cosets
//   실용적으로: (12)→(12)∈S_3, (23)→(23)∈S_3, (34)→(12)∈S_3 (coset representative)
//   즉 S_4의 2D irrep에서 (12) → [[-1,1],[0,1]], (23) → [[1,0],[1,-1]], (34) → [[-1,1],[0,1]]
// 3D standard: (12) → P_{12} 제한 to (1,1,1,1)⊥
//   P_{12}의 (1,1,1,1)⊥ 에서의 행렬 (기저: e1-e2, e2-e3, e3-e4)
//   (12): [[-1,0,0],[1,1,0],[0,0,1]]
//   (23): [[1,1,0],[0,-1,0],[0,1,1]]
//   (34): [[1,0,0],[0,1,1],[0,0,-1]]

function s4IrrepsR() {
  const id12 = '1,0,2,3', id23 = '0,2,1,3', id34 = '0,1,3,2'

  const std3_12 = [[-1, 0, 0], [1, 1, 0], [0, 0, 1]]
  const std3_23 = [[1, 1, 0], [0, -1, 0], [0, 1, 1]]
  const std3_34 = [[1, 0, 0], [0, 1, 1], [0, 0, -1]]

  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'R', charLabel: 'χ₁',
      genMatrices: { [id12]: [[1]], [id23]: [[1]], [id34]: [[1]] },
    }),
    buildIrrep({
      name: 'sign', dim: 1, field: 'R', charLabel: 'χ₂',
      genMatrices: { [id12]: [[-1]], [id23]: [[-1]], [id34]: [[-1]] },
    }),
    buildIrrep({
      name: 'ρ₂', dim: 2, field: 'R', charLabel: 'χ₃',
      genMatrices: {
        [id12]: [[-1, 1], [0, 1]],
        [id23]: [[1, 0], [1, -1]],
        [id34]: [[-1, 1], [0, 1]],   // (34)는 V₄ 몫에서 (12)와 같은 coset
      },
    }),
    buildIrrep({
      name: 'std', dim: 3, field: 'R', charLabel: 'χ₄',
      genMatrices: { [id12]: std3_12, [id23]: std3_23, [id34]: std3_34 },
    }),
    buildIrrep({
      name: 'std⊗sgn', dim: 3, field: 'R', charLabel: 'χ₅',
      genMatrices: {
        [id12]: std3_12.map(r => r.map(v => -v)),
        [id23]: std3_23.map(r => r.map(v => -v)),
        [id34]: std3_34.map(r => r.map(v => -v)),
      },
    }),
  ]
}

function s4IrrepsC() {
  return s4IrrepsR().map(irr => buildIrrep({
    name: irr.name, dim: irr.dim, field: 'C', charLabel: irr.charLabel,
    genMatrices: Object.fromEntries(
      Object.entries(irr.genMatrices).map(([k, M]) => [k, toC(M)])
    ),
  }))
}

// ─── A_3 ≅ Z_3 irrep ──────────────────────────────────────────────────────
// 생성원: (123), id = '1,2,0'
// ℝ 위: trivial (1D) + 2D rotation by 2π/3
// ℂ 위: trivial, ω=e^{2πi/3}, ω² (각 1D)

function a3IrrepsR() {
  const r123Id = '1,2,0'
  const theta = 2 * Math.PI / 3
  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'R', charLabel: 'χ₁',
      genMatrices: { [r123Id]: [[1]] },
    }),
    buildIrrep({
      name: 'ρ₂ᴰ', dim: 2, field: 'R', charLabel: 'χ₂ᴿ',
      genMatrices: { [r123Id]: rot2(theta) },
    }),
  ]
}

function a3IrrepsC() {
  const r123Id = '1,2,0'
  const omega = cx(Math.cos(2 * Math.PI / 3), Math.sin(2 * Math.PI / 3))
  const omega2 = cx(Math.cos(4 * Math.PI / 3), Math.sin(4 * Math.PI / 3))
  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'C', charLabel: 'χ₁',
      genMatrices: { [r123Id]: [[cx(1)]] },
    }),
    buildIrrep({
      name: 'ω', dim: 1, field: 'C', charLabel: 'χ₂',
      genMatrices: { [r123Id]: [[omega]] },
    }),
    buildIrrep({
      name: 'ω²', dim: 1, field: 'C', charLabel: 'χ₃',
      genMatrices: { [r123Id]: [[omega2]] },
    }),
  ]
}

// ─── A_4 irrep ────────────────────────────────────────────────────────────
// 생성원: (123) id='1,2,0,3', (124) id='1,3,2,0' → 수정 필요
// (123): [0,1,2,3] → [1,2,0,3] ... wait, 0-indexed: (1 2 3) maps 1→2, 2→3, 3→1, 0 fixed
// perm (1 2 3) in 0-indexed: 0→0, 1→2, 2→3, 3→1 => array [0, 2, 3, 1]
// snLabel([0,2,3,1]) = (234) ... hmm
//
// 0-indexed: (123) means element 1→2, 2→3, 3→1
// perm[i] = destination of i
// i=0: fixed → perm[0]=0
// i=1: 1→2  → perm[1]=2
// i=2: 2→3  → perm[2]=3  (실제로 0-indexed에서 (123)은 1,2,3 → 2,3,1)
// i=3: 3→1  → perm[3]=1
// So perm = [0, 2, 3, 1], snId = '0,2,3,1'

function a4IrrepsR() {
  const r123Id = '0,2,3,1'   // (123) in 0-indexed
  const r124Id = '0,2,0,1'   // (124): 1→2, 2→4... wait 4 doesn't exist in 4-element perm

  // A_4 generators: actually, let me recompute
  // A_4 has order 12. Generators: (12)(34) and (123) for example
  // Or (123) and (124)
  // (124) in 0-indexed: 1→2, 2→4→ but 4 doesn't exist for 4 elements (0..3)
  // Let me use (134) = 1→3, 3→4... still issues
  // For 0-indexed (0..3): (012) = 0→1, 1→2, 2→0: perm = [1,2,0,3], id='1,2,0,3'
  // (013) = 0→1, 1→3, 3→0: perm = [1,3,2,0], id='1,3,2,0'

  const gen1Id = '1,2,0,3'  // (012) in 0-indexed = (123) in 1-indexed
  const gen2Id = '1,3,2,0'  // (013) in 0-indexed = (124) in 1-indexed

  // A_4의 3D standard irrep: permutation matrices restricted to (1,1,1,1)⊥
  // generators: (012) → P_{012}, (013) → P_{013}
  // Basis: e0-e1, e1-e2, e2-e3
  // (012): 0→1, 1→2, 2→0, 3 fixed
  //   e0-e1 → e1-e2
  //   e1-e2 → e2-e0 = -(e0-e2) = -(e0-e1) - (e1-e2) wait...
  // Let basis: b1=e0-e1, b2=e1-e2, b3=e2-e3
  // (012): 0→1,1→2,2→0,3→3
  //   b1 = e0-e1 → e1-e2 = b2
  //   b2 = e1-e2 → e2-e0 = -(e0-e2) = -(b1+b2)
  //   b3 = e2-e3 → e0-e3 = b1+b2+b3
  // matrix: cols = images of basis vectors
  //   b1 → b2     → col 1 = (0,1,0)
  //   b2 → -(b1+b2) → col 2 = (-1,-1,0)
  //   b3 → b1+b2+b3 → col 3 = (1,1,1)
  // So matrix (row i = coeff of b_i in image):
  //   [[0,-1,1],[1,-1,1],[0,0,1]]
  // (013): 0→1, 1→3, 3→0, 2→2
  //   b1 = e0-e1 → e1-e3 = b2+b3
  //   b2 = e1-e2 → e3-e2 = -b3
  //   b3 = e2-e3 → e2-e0 = -(b1+b2+b3) → ... wait
  //   e2-e0: e2-e0 = -(e0-e2) = -(b1+b2) (since e0-e2 = (e0-e1)+(e1-e2) = b1+b2)
  //   Wait: b3 = e2-e3 → e2 becomes e2, e3 → e0: so e2-e3 → e2-e0 = -(e0-e2) = -(b1+b2)
  //   So: b1→b2+b3, b2→-b3, b3→-(b1+b2)
  //   matrix: [[0,0,-1],[1,0,-1],[1,-1,0]]

  const std3_012 = [[0, -1, 1], [1, -1, 1], [0, 0, 1]]
  const std3_013 = [[0, 0, -1], [1, 0, -1], [1, -1, 0]]

  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'R', charLabel: 'χ₁',
      genMatrices: { [gen1Id]: [[1]], [gen2Id]: [[1]] },
    }),
    buildIrrep({
      name: 'std', dim: 3, field: 'R', charLabel: 'χ₄',
      genMatrices: { [gen1Id]: std3_012, [gen2Id]: std3_013 },
    }),
  ]
}

function a4IrrepsC() {
  const gen1Id = '1,2,0,3'
  const gen2Id = '1,3,2,0'
  const omega  = cx(Math.cos(2 * Math.PI / 3), Math.sin(2 * Math.PI / 3))
  const omega2 = cx(Math.cos(4 * Math.PI / 3), Math.sin(4 * Math.PI / 3))

  const real = a4IrrepsR()
  return [
    buildIrrep({
      name: 'trivial', dim: 1, field: 'C', charLabel: 'χ₁',
      genMatrices: { [gen1Id]: [[cx(1)]], [gen2Id]: [[cx(1)]] },
    }),
    buildIrrep({
      name: 'ω', dim: 1, field: 'C', charLabel: 'χ₂',
      genMatrices: { [gen1Id]: [[omega]], [gen2Id]: [[cx(1)]] },
    }),
    buildIrrep({
      name: 'ω²', dim: 1, field: 'C', charLabel: 'χ₃',
      genMatrices: { [gen1Id]: [[omega2]], [gen2Id]: [[cx(1)]] },
    }),
    buildIrrep({
      name: 'std', dim: 3, field: 'C', charLabel: 'χ₄',
      genMatrices: Object.fromEntries(
        Object.entries(real[1].genMatrices).map(([k, M]) => [k, toC(M)])
      ),
    }),
  ]
}

// ─── 공개 API ────────────────────────────────────────────────────────────

export function getIrreps(groupKey, field) {
  if (groupKey.startsWith('D')) {
    const n = parseInt(groupKey.slice(1))
    return field === 'R' ? dnIrrepsR(n) : dnIrrepsC(n)
  }
  if (groupKey === 'V4') return field === 'R' ? v4IrrepsR() : v4IrrepsC()
  if (groupKey === 'S3') return field === 'R' ? s3IrrepsR() : s3IrrepsC()
  if (groupKey === 'S4') return field === 'R' ? s4IrrepsR() : s4IrrepsC()
  if (groupKey === 'A3') return field === 'R' ? a3IrrepsR() : a3IrrepsC()
  if (groupKey === 'A4') return field === 'R' ? a4IrrepsR() : a4IrrepsC()
  return []
}

// 지표표: irrep별 각 원소 클래스에서의 trace 값
export function characterTable(group, irreps, field) {
  // 켤레류 구하기
  const classes = conjugacyClasses(group)
  const table = irreps.map(irr => ({
    name: irr.name,
    chars: classes.map(cls => {
      const M = irr.getMatrix(group, cls[0])
      return trace(M, field)
    }),
  }))
  return { classes: classes.map(cls => group.elementLabel(cls[0])), table }
}

function conjugacyClasses(group) {
  const elems = group.elements
  const assigned = new Set()
  const classes = []
  for (const g of elems) {
    const gId = group.id(g)
    if (assigned.has(gId)) continue
    const cls = []
    for (const h of elems) {
      // hgh^{-1} — h의 역원 필요
      // h의 역원: h^{-1} = element such that h * h^{-1} = e
      const eId = group.id(group.elements[0])
      let hinv = null
      for (const x of elems) {
        if (group.id(group.multiply(h, x)) === eId) { hinv = x; break }
      }
      if (!hinv) continue
      const conj = group.multiply(group.multiply(h, g), hinv)
      cls.push(group.id(conj))
    }
    const clsUniq = [...new Set(cls)].map(id => elems.find(e => group.id(e) === id))
    for (const e of clsUniq) assigned.add(group.id(e))
    classes.push(clsUniq)
  }
  return classes
}

function trace(M, field) {
  if (field === 'R') {
    let t = 0; for (let i = 0; i < M.length; i++) t += M[i][i]; return t
  } else {
    let re = 0, im = 0
    for (let i = 0; i < M.length; i++) { re += M[i][i].re; im += M[i][i].im }
    return im === 0 ? re.toFixed(2) : `${re.toFixed(1)}+${im.toFixed(1)}i`
  }
}
