import { matMul, identityR } from './groups.js'

// ─── 행렬 헬퍼 ───────────────────────────────────────────────────────────────

function rot2(theta) {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [[c, -s], [s, c]]
}

function reflY() { return [[1, 0], [0, -1]] }

// Pre-orthogonalized basis constants shared by S3/S4/A4 irreps.
// Values: _r3h = √3/2, _s8 = sin(π/8), _c8 = cos(π/8), _r2 = 1/√2,
//         _q = sin(π/8)cos(π/8) = sin(π/4)/2, _s2 = sin²(π/8), _c2 = cos²(π/8)
const _r3h = Math.sqrt(3) / 2
const _s8  = Math.sin(Math.PI / 8)
const _c8  = Math.cos(Math.PI / 8)
const _r2  = Math.SQRT1_2
const _q   = _s8 * _c8
const _s2  = _s8 * _s8
const _c2  = _c8 * _c8

// ─── Irrep 팩토리 ─────────────────────────────────────────────────────────────

function buildIrrep({ name, dim, field = 'R', charLabel, genMatrices }) {
  const cache = new Map()

  function getMatrix(group, element) {
    const key = group.id(element)
    if (cache.has(key)) return cache.get(key)

    if (genMatrices[key]) { cache.set(key, genMatrices[key]); return genMatrices[key] }

    const identity = group.elements[0]
    const idKey = group.id(identity)
    const I = identityR(dim)

    if (key === idKey) { cache.set(key, I); return I }

    const seen = new Map()
    seen.set(idKey, I)
    const queue = [[identity, I]]

    while (queue.length > 0) {
      const [cur, mat] = queue.shift()
      const curKey = group.id(cur)
      for (const gen of group.generators) {
        const next = group.multiply(cur, gen)
        const nextKey = group.id(next)
        if (!seen.has(nextKey)) {
          const genMat = genMatrices[group.id(gen)]
          const nextMat = matMul(mat, genMat)
          seen.set(nextKey, nextMat)
          if (nextKey === key) { cache.set(key, nextMat); return nextMat }
          queue.push([next, nextMat])
        }
      }
    }

    cache.set(key, I)
    return I
  }

  return { name, dim, field: 'R', charLabel: charLabel || name, genMatrices, getMatrix }
}

// ─── D_n irrep ────────────────────────────────────────────────────────────

function dnIrreps(n) {
  const irreps = []
  const rId = 'r1', sId = 's0'

  irreps.push(buildIrrep({
    name: 'trivial', dim: 1, charLabel: 'χ₁',
    genMatrices: { [rId]: [[1]], [sId]: [[1]] },
  }))

  if (n % 2 === 1) {
    irreps.push(buildIrrep({
      name: 'det', dim: 1, charLabel: 'χ₂',
      genMatrices: { [rId]: [[1]], [sId]: [[-1]] },
    }))
  } else {
    irreps.push(buildIrrep({
      name: 'det', dim: 1, charLabel: 'χ₂',
      genMatrices: { [rId]: [[1]], [sId]: [[-1]] },
    }))
    irreps.push(buildIrrep({
      name: "det'", dim: 1, charLabel: 'χ₃',
      genMatrices: { [rId]: [[-1]], [sId]: [[1]] },
    }))
    irreps.push(buildIrrep({
      name: "det''", dim: 1, charLabel: 'χ₄',
      genMatrices: { [rId]: [[-1]], [sId]: [[-1]] },
    }))
  }

  const limit = Math.floor((n - 1) / 2)
  for (let k = 1; k <= limit; k++) {
    const theta = 2 * Math.PI * k / n
    irreps.push(buildIrrep({
      name: k === 1 ? 'std' : `ρ${k}`,
      dim: 2, charLabel: k === 1 ? 'χ₂ᴰ' : `χ${k}ᴰ`,
      genMatrices: { [rId]: rot2(theta), [sId]: reflY() },
    }))
  }

  return irreps
}


// ─── S_3 irrep ───────────────────────────────────────────────────────────
// std 2D: pre-orthogonalized reflection matrices.

function s3Irreps() {
  const tau1Id = '1,0,2', tau2Id = '0,2,1'
  return [
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [tau1Id]: [[1]], [tau2Id]: [[1]] },
    }),
    buildIrrep({
      name: 'sign', dim: 1, charLabel: 'χ₂',
      genMatrices: { [tau1Id]: [[-1]], [tau2Id]: [[-1]] },
    }),
    buildIrrep({
      name: 'std', dim: 2, charLabel: 'χ₃',
      genMatrices: {
        [tau1Id]: [[ 0.5, -_r3h], [-_r3h, -0.5]],
        [tau2Id]: [[ 0.5,  _r3h], [ _r3h, -0.5]],
      },
    }),
  ]
}

// ─── S_4 irrep ────────────────────────────────────────────────────────────
// All non-trivial/sign irreps: pre-orthogonalized.

function s4Irreps() {
  const id12 = '1,0,2,3', id23 = '0,2,1,3', id34 = '0,1,3,2'

  return [
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [id12]: [[1]], [id23]: [[1]], [id34]: [[1]] },
    }),
    buildIrrep({
      name: 'sign', dim: 1, charLabel: 'χ₂',
      genMatrices: { [id12]: [[-1]], [id23]: [[-1]], [id34]: [[-1]] },
    }),
    buildIrrep({
      name: 'ρ₂', dim: 2, charLabel: 'χ₃',
      genMatrices: {
        [id12]: [[ 0.5, -_r3h], [-_r3h, -0.5]],
        [id23]: [[ 0.5,  _r3h], [ _r3h, -0.5]],
        [id34]: [[ 0.5, -_r3h], [-_r3h, -0.5]],
      },
    }),
    buildIrrep({
      name: 'std', dim: 3, charLabel: 'χ₄',
      genMatrices: {
        [id12]: [[ _s2,  _c8,  _q], [ _c8, 0, -_s8], [ _q, -_s8,  _c2]],
        [id23]: [[-_r2,    0, -_r2], [   0, 1,    0], [-_r2,   0,  _r2]],
        [id34]: [[ _s2, -_c8,  _q], [-_c8, 0,  _s8], [ _q,  _s8,  _c2]],
      },
    }),
    buildIrrep({
      name: 'std⊗sgn', dim: 3, charLabel: 'χ₅',
      genMatrices: {
        [id12]: [[-_s2, -_c8, -_q], [-_c8, 0,  _s8], [-_q,  _s8, -_c2]],
        [id23]: [[ _r2,    0,  _r2], [   0, -1,   0], [ _r2,  0,  -_r2]],
        [id34]: [[-_s2,  _c8, -_q], [ _c8, 0, -_s8], [-_q, -_s8, -_c2]],
      },
    }),
  ]
}


// ─── A_5 irrep ────────────────────────────────────────────────────────────
// r = (12345) 1-indexed → '1,2,3,4,0'
// c = (142)  1-indexed → '3,0,2,1,4'

function a5Irreps() {
  const rId = '1,2,3,4,0'
  const cId = '3,0,2,1,4'
  const sq5 = Math.sqrt(5)

  return [
    // 1D trivial
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [rId]: [[1]], [cId]: [[1]] },
    }),

    // 3D icosahedral (already orthogonal, α = +√5)
    buildIrrep({
      name: '3D', dim: 3, charLabel: 'χ₃',
      genMatrices: {
        [rId]: [
          [(-1+sq5)/4, -(1+sq5)/4,  0.5],
          [ (1+sq5)/4,  0.5,        (-1+sq5)/4],
          [-0.5,        (-1+sq5)/4,  (1+sq5)/4],
        ],
        [cId]: [[0,0,1],[1,0,0],[0,1,0]],
      },
    }),

    // 3D' Galois conjugate (already orthogonal, α = −√5)
    buildIrrep({
      name: "3D'", dim: 3, charLabel: "χ₃'",
      genMatrices: {
        [rId]: [
          [(-1-sq5)/4, -(1-sq5)/4,  0.5],
          [ (1-sq5)/4,  0.5,        (-1-sq5)/4],
          [-0.5,        (-1-sq5)/4,  (1-sq5)/4],
        ],
        [cId]: [[0,0,1],[1,0,0],[0,1,0]],
      },
    }),

    // 4D: pre-orthogonalized permutation restriction
    buildIrrep({
      name: '4D', dim: 4, charLabel: 'χ₄',
      genMatrices: {
        [rId]: [
          [-0.5,              -0.771846213546, -0.392751095015,  0],
          [ 0.349854392050,    0.183913380773, -0.806821538162, -0.439109073345],
          [-0.051008865539,    0.253838633618, -0.433913380773,  0.862950300832],
          [-0.790569415042,    0.553168364145, -0.080652097982, -0.25],
        ],
        [cId]: [
          [ 0.5,               0.627571354653, -0.596786557170,  0],
          [ 0.771846213546,   -0.010407617454,  0.635724078618,  0],
          [ 0.392751095015,   -0.778489483755, -0.489592382546,  0],
          [ 0,                 0,               0,               1],
        ],
      },
    }),

    // 5D: pre-orthogonalized augmented permutation restriction
    buildIrrep({
      name: '5D', dim: 5, charLabel: 'χ₅',
      genMatrices: {
        [rId]: [
          [-0.135895036780, -0.475003884690,  0.598587758455,  0.522563416325,  0.352879610994],
          [-0.958498914090, -0.021886573310, -0.053743592436, -0.265588049542,  0.085880287663],
          [-0.187816159712, -0.134285899485,  0.029041825608,  0.395743211860, -0.888389706144],
          [-0.018237835803, -0.480452738233, -0.788605361011,  0.328739784482,  0.197140270754],
          [ 0.164938904332, -0.724585916895,  0.126737834326, -0.625865742971, -0.2],
        ],
        [cId]: [
          [ 0.022274704206, -0.066111913693,  0.431040943052, -0.884382222611,  0.164938904332],
          [-0.406875928133, -0.392911959591,  0.387007627554,  0.072612095194, -0.724585916895],
          [ 0.540466669956, -0.826921034707, -0.048213308757,  0.075567051250,  0.126737834326],
          [ 0.386094581858,  0.153020118956, -0.539011128247, -0.381149435858, -0.625865742971],
          [ 0.626723678494,  0.366109071770,  0.609566470626,  0.248214214482, -0.2],
        ],
      },
    }),
  ]
}

// ─── A_4 irrep ────────────────────────────────────────────────────────────
// std 3D: pre-orthogonalized.

function a4Irreps() {
  const gen1Id = '1,2,0,3'  // (012) in 0-indexed = (123) in 1-indexed
  const gen2Id = '1,3,2,0'  // (013) in 0-indexed = (124) in 1-indexed

  return [
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [gen1Id]: [[1]], [gen2Id]: [[1]] },
    }),
    buildIrrep({
      name: '2D', dim: 2, charLabel: 'χ₂₃',
      genMatrices: { [gen1Id]: rot2(2 * Math.PI / 3), [gen2Id]: rot2(4 * Math.PI / 3) },
    }),
    buildIrrep({
      name: 'std', dim: 3, charLabel: 'χ₄',
      genMatrices: {
        [gen1Id]: [[ _q, -_s8, -_c2], [-_c8, 0, -_s8], [_s2,  _c8, -_q]],
        [gen2Id]: [[-_q,  _c8, -_s2], [-_s8, 0,  _c8], [_c2,  _s8,  _q]],
      },
    }),
  ]
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

export function getIrreps(groupKey) {
  if (groupKey.startsWith('D')) {
    const n = parseInt(groupKey.slice(1))
    return dnIrreps(n)
  }
  if (groupKey === 'S3') return s3Irreps()
  if (groupKey === 'S4') return s4Irreps()
  if (groupKey === 'A4') return a4Irreps()
  if (groupKey === 'A5') return a5Irreps()
  return []
}

export function characterTable(group, irreps) {
  const classes = conjugacyClasses(group)
  const table = irreps.map(irr => ({
    name: irr.name,
    chars: classes.map(cls => trace(irr.getMatrix(group, cls[0]))),
  }))
  return { classes: classes.map(cls => group.elementLabel(cls[0])), table }
}

function conjugacyClasses(group) {
  const elems = group.elements
  const assigned = new Set()
  const classes = []
  const eId = group.id(elems[0])
  for (const g of elems) {
    const gId = group.id(g)
    if (assigned.has(gId)) continue
    const cls = []
    for (const h of elems) {
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

function trace(M) {
  let t = 0
  for (let i = 0; i < M.length; i++) t += M[i][i]
  return t
}
