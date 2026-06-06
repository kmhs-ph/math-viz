import { matMul, identityR } from './groups.js'

// ─── 행렬 헬퍼 ───────────────────────────────────────────────────────────────

function rot2(theta) {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [[c, -s], [s, c]]
}

function reflY() { return [[1, 0], [0, -1]] }

function matMulSmall(A, B) {
  const n = A.length, m = B[0].length, k = B.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) =>
      A[i].reduce((s, v, l) => s + v * B[l][j], 0)
    )
  )
}

// Jacobi eigendecomposition for symmetric real matrix.
// Returns { values: float[], vectors: float[][] } where vectors[i][k] = i-th component of k-th eigenvector.
function eigenSymm(M) {
  const n = M.length
  let A = M.map(r => [...r])
  let V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )
  for (let iter = 0; iter < 200; iter++) {
    let p = 0, q = 1, maxVal = 0
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(A[i][j]) > maxVal) { maxVal = Math.abs(A[i][j]); p = i; q = j }
    if (maxVal < 1e-12) break

    const diff = A[q][q] - A[p][p]
    const theta = diff === 0 ? Math.PI / 4 : 0.5 * Math.atan2(2 * A[p][q], diff)
    const c = Math.cos(theta), s = Math.sin(theta)

    const Anew = A.map(r => [...r])
    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue
      Anew[i][p] = Anew[p][i] = c * A[i][p] - s * A[i][q]
      Anew[i][q] = Anew[q][i] = s * A[i][p] + c * A[i][q]
    }
    Anew[p][p] = c * c * A[p][p] - 2 * s * c * A[p][q] + s * s * A[q][q]
    Anew[q][q] = s * s * A[p][p] + 2 * s * c * A[p][q] + c * c * A[q][q]
    Anew[p][q] = Anew[q][p] = 0
    A = Anew

    const Vnew = V.map(r => [...r])
    for (let i = 0; i < n; i++) {
      Vnew[i][p] = c * V[i][p] - s * V[i][q]
      Vnew[i][q] = s * V[i][p] + c * V[i][q]
    }
    V = Vnew
  }
  return { values: A.map((r, i) => r[i]), vectors: V }
}

// Conjugate all generator matrices to an ONB w.r.t. the G-invariant inner product.
// For representations that already use orthogonal matrices, this is a no-op (P = I).
function orthogonalizeRep(irr, group) {
  const dim = irr.dim
  const elems = group.elements
  const sz = elems.length

  // Gram matrix: M = (1/|G|) Σ_g ρ(g)ᵀ ρ(g)
  const gram = Array.from({ length: dim }, () => Array(dim).fill(0))
  for (const elem of elems) {
    const rho = irr.getMatrix(group, elem)
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++) {
        let s = 0
        for (let k = 0; k < dim; k++) s += rho[k][i] * rho[k][j]
        gram[i][j] += s
      }
  }
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) gram[i][j] /= sz

  // Check if already orthogonal (gram ≈ I)
  let maxErr = 0
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      const expected = i === j ? 1 : 0
      maxErr = Math.max(maxErr, Math.abs(gram[i][j] - expected))
    }
  if (maxErr < 1e-8) return irr  // already orthogonal

  const { values, vectors } = eigenSymm(gram)

  // P = V Λ^{-1/2}: columns are G-ONB.  P[i][j] = vectors[i][j] / sqrt(values[j])
  // P_inv = Λ^{1/2} Vᵀ:  P_inv[i][j] = sqrt(values[i]) * vectors[j][i]
  const P = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => vectors[i][j] / Math.sqrt(Math.max(values[j], 1e-14)))
  )
  const Pinv = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => Math.sqrt(Math.max(values[i], 1e-14)) * vectors[j][i])
  )

  const newGenMatrices = {}
  for (const [genId, rho] of Object.entries(irr.genMatrices)) {
    newGenMatrices[genId] = matMulSmall(Pinv, matMulSmall(rho, P))
  }

  return buildIrrep({
    name: irr.name,
    dim: irr.dim,
    field: 'R',
    charLabel: irr.charLabel,
    genMatrices: newGenMatrices,
  })
}

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

// ─── V_4 irrep ───────────────────────────────────────────────────────────

function v4Irreps() {
  const signs = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  const names = ['trivial', 'χ_a', 'χ_b', 'χ_ab']
  return signs.map(([ sa, sb ], i) => buildIrrep({
    name: names[i], dim: 1, charLabel: `χ${i + 1}`,
    genMatrices: { '10': [[sa]], '01': [[sb]] },
  }))
}

// ─── S_3 irrep ───────────────────────────────────────────────────────────
// Basis e1-e2, e2-e3 is NOT orthonormal → orthogonalize.

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
      genMatrices: { [tau1Id]: [[-1, 1], [0, 1]], [tau2Id]: [[1, 0], [1, -1]] },
    }),
  ]
}

// ─── S_4 irrep ────────────────────────────────────────────────────────────
// ρ₂ and std3 use non-orthonormal bases → orthogonalize.

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
        [id12]: [[-1, 1], [0, 1]],
        [id23]: [[1, 0], [1, -1]],
        [id34]: [[-1, 1], [0, 1]],
      },
    }),
    buildIrrep({
      name: 'std', dim: 3, charLabel: 'χ₄',
      genMatrices: {
        [id12]: [[-1, 0, 0], [1, 1, 0], [0, 0, 1]],
        [id23]: [[1, 1, 0], [0, -1, 0], [0, 1, 1]],
        [id34]: [[1, 0, 0], [0, 1, 1], [0, 0, -1]],
      },
    }),
    buildIrrep({
      name: 'std⊗sgn', dim: 3, charLabel: 'χ₅',
      genMatrices: {
        [id12]: [[1, 0, 0], [-1, -1, 0], [0, 0, -1]],
        [id23]: [[-1, -1, 0], [0, 1, 0], [0, -1, -1]],
        [id34]: [[-1, 0, 0], [0, -1, -1], [0, 0, 1]],
      },
    }),
  ]
}

// ─── A_3 ≅ Z_3 irrep ──────────────────────────────────────────────────────

function a3Irreps() {
  const r123Id = '1,2,0'
  return [
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [r123Id]: [[1]] },
    }),
    buildIrrep({
      name: 'rot', dim: 2, charLabel: 'χ₂ᴿ',
      genMatrices: { [r123Id]: rot2(2 * Math.PI / 3) },
    }),
  ]
}

// ─── A_4 irrep ────────────────────────────────────────────────────────────
// std3 uses non-orthonormal basis → orthogonalize.

function a4Irreps() {
  const gen1Id = '1,2,0,3'  // (012) in 0-indexed
  const gen2Id = '1,3,2,0'  // (013) in 0-indexed

  return [
    buildIrrep({
      name: 'trivial', dim: 1, charLabel: 'χ₁',
      genMatrices: { [gen1Id]: [[1]], [gen2Id]: [[1]] },
    }),
    buildIrrep({
      name: '2D', dim: 2, charLabel: 'χ₂₃',
      // (012) in C₃ class → ω = e^{2πi/3}; (013) in C₃' class → ω²
      genMatrices: { [gen1Id]: rot2(2 * Math.PI / 3), [gen2Id]: rot2(4 * Math.PI / 3) },
    }),
    buildIrrep({
      name: 'std', dim: 3, charLabel: 'χ₄',
      genMatrices: {
        [gen1Id]: [[0, -1, 1], [1, -1, 1], [0, 0, 1]],
        [gen2Id]: [[0, 0, -1], [1, 0, -1], [1, -1, 0]],
      },
    }),
  ]
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

// group is the GROUPS[groupKey] object, needed for orthogonalization.
export function getIrreps(groupKey, group) {
  let raw
  if (groupKey.startsWith('D')) {
    const n = parseInt(groupKey.slice(1))
    raw = dnIrreps(n)
  } else if (groupKey === 'V4') {
    raw = v4Irreps()
  } else if (groupKey === 'S3') {
    raw = s3Irreps()
  } else if (groupKey === 'S4') {
    raw = s4Irreps()
  } else if (groupKey === 'A3') {
    raw = a3Irreps()
  } else if (groupKey === 'A4') {
    raw = a4Irreps()
  } else {
    return []
  }

  // Orthogonalize every irrep (no-op for already-orthogonal reps).
  return raw.map(irr => orthogonalizeRep(irr, group))
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
