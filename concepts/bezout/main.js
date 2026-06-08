// ── 1. Constants & tolerances ─────────────────────────────────────────────────

const GRID_N                  = 160
const ROOT_RESIDUAL_TOL       = 1e-7
const INTERSECTION_RESIDUAL_TOL = 1e-6
const ROOT_DEDUP_TOL          = 1e-5
const POINT_DEDUP_TOL         = 1e-4
const INF_DEDUP_TOL           = 1e-4  // looser than spec's 1e-6: a double root at infinity
                                      // leaves two roots ~1e-5 apart (DK residual floor); distinct
                                      // infinity directions of deg≤3 integer curves are far further apart

const REAL_TOL                = 1e-6
const JACOBIAN_TOL            = 1e-9
const NEWTON_MAX_ITER         = 20
const NEWTON_STEP_TOL         = 1e-10
const DK_MAX_ITER             = 2000
const DK_STEP_TOL             = 1e-12
const DK_RESIDUAL_TOL         = 1e-10
const DK_DENOM_TOL            = 1e-14

// ── 2. Complex arithmetic ──────────────────────────────────────────────────────

function C(re, im = 0) { return { re, im } }
function cAdd(a, b) { return C(a.re + b.re, a.im + b.im) }
function cSub(a, b) { return C(a.re - b.re, a.im - b.im) }
function cMul(a, b) { return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re) }
function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
function cNeg(a)        { return C(-a.re, -a.im) }
function cAbs(a)        { return Math.hypot(a.re, a.im) }
function cAbs2(a)       { return a.re * a.re + a.im * a.im }
function cConj(a)       { return C(a.re, -a.im) }
function cScale(a, s)   { return C(a.re * s, a.im * s) }
function cExp(a)        { const e = Math.exp(a.re); return C(e * Math.cos(a.im), e * Math.sin(a.im)) }
function cEqApprox(a, b, tol = 1e-9) { return Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol }
function cFromPolar(r, theta) { return C(r * Math.cos(theta), r * Math.sin(theta)) }

// ── 3. Univariate polynomial utilities ────────────────────────────────────────
// ascending convention: coeffs[k] is coefficient of z^k

function trimUniBig(p) {
  let i = p.length - 1
  while (i > 0 && p[i] === 0n) i--
  return p.slice(0, i + 1)
}

function trimUniComplex(p) {
  let i = p.length - 1
  while (i > 0 && cAbs(p[i]) < 1e-300) i--
  return p.slice(0, i + 1)
}

function degreeUni(p) { return p.length - 1 }

function addUniBig(a, b) {
  const len = Math.max(a.length, b.length)
  const r = []
  for (let i = 0; i < len; i++) r.push((a[i] ?? 0n) + (b[i] ?? 0n))
  return trimUniBig(r)
}

function subUniBig(a, b) {
  const len = Math.max(a.length, b.length)
  const r = []
  for (let i = 0; i < len; i++) r.push((a[i] ?? 0n) - (b[i] ?? 0n))
  return trimUniBig(r)
}

function mulUniBig(a, b) {
  if (a.length === 0 || b.length === 0) return [0n]
  const r = new Array(a.length + b.length - 1).fill(0n)
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      r[i + j] += a[i] * b[j]
  return trimUniBig(r)
}

function scaleUniBig(a, c) { return a.map(x => x * c) }

function evalUniComplex(coeffs, z) {
  // Horner's method
  let r = C(0)
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = typeof coeffs[i] === 'bigint' ? C(Number(coeffs[i])) : coeffs[i]
    r = cAdd(cMul(r, z), c)
  }
  return r
}

function convertBigToComplex(p) {
  return p.map(c => C(Number(c)))
}

// ── 4. Bivariate polynomial utilities ─────────────────────────────────────────
// BiPoly = Map<"i,j", bigint>  (key = "i,j" means x^i y^j)

function biKey(i, j) { return `${i},${j}` }
function biParsKey(k) { const [i, j] = k.split(',').map(Number); return [i, j] }

function degreeTotal(p) {
  let d = 0
  for (const k of p.keys()) { const [i, j] = biParsKey(k); d = Math.max(d, i + j) }
  return d
}

function degreeX(p) {
  let d = 0
  for (const k of p.keys()) { const [i] = biParsKey(k); d = Math.max(d, i) }
  return d
}

function degreeY(p) {
  let d = 0
  for (const k of p.keys()) { const [, j] = biParsKey(k); d = Math.max(d, j) }
  return d
}

function coeffAbsMax(p) {
  let m = 0n
  for (const v of p.values()) { const a = v < 0n ? -v : v; if (a > m) m = a }
  return m
}

function evalBiPolyComplex(p, x, y) {
  let r = C(0)
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    let term = C(Number(cv))
    for (let a = 0; a < i; a++) term = cMul(term, x)
    for (let b = 0; b < j; b++) term = cMul(term, y)
    r = cAdd(r, term)
  }
  return r
}

function partialX(p) {
  const r = new Map()
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    if (i === 0) continue
    const nk = biKey(i - 1, j)
    r.set(nk, (r.get(nk) ?? 0n) + BigInt(i) * cv)
  }
  return r
}

function partialY(p) {
  const r = new Map()
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    if (j === 0) continue
    const nk = biKey(i, j - 1)
    r.set(nk, (r.get(nk) ?? 0n) + BigInt(j) * cv)
  }
  return r
}

function leadingHomogeneousPart(p) {
  const d = degreeTotal(p)
  const r = new Map()
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    if (i + j === d) r.set(k, cv)
  }
  return r
}

// coeffsInX(p): returns array A where A[i] is a UniPolyBig in y,
// so that p(x,y) = sum_i A[i](y) * x^i
function coeffsInX(p) {
  const dx = degreeX(p)
  const res = []
  for (let i = 0; i <= dx; i++) res.push([])
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    while (res[i].length <= j) res[i].push(0n)
    res[i][j] = (res[i][j] ?? 0n) + cv
  }
  for (let i = 0; i <= dx; i++) {
    if (res[i].length === 0) res[i] = [0n]
    res[i] = trimUniBig(res[i])
  }
  return res
}

// coeffsInY(p): returns array B where B[j] is a UniPolyBig in x
function coeffsInY(p) {
  const dy = degreeY(p)
  const res = []
  for (let j = 0; j <= dy; j++) res.push([])
  for (const [k, cv] of p) {
    const [i, j] = biParsKey(k)
    while (res[j].length <= i) res[j].push(0n)
    res[j][i] = (res[j][i] ?? 0n) + cv
  }
  for (let j = 0; j <= dy; j++) {
    if (res[j].length === 0) res[j] = [0n]
    res[j] = trimUniBig(res[j])
  }
  return res
}

// ── 5. Parser ──────────────────────────────────────────────────────────────────

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue }
    if (/\d/.test(src[i])) {
      let n = ''
      while (i < src.length && /\d/.test(src[i])) n += src[i++]
      tokens.push({ type: 'num', value: BigInt(n) })
    } else if (src[i] === 'x') { tokens.push({ type: 'var', name: 'x' }); i++ }
    else if (src[i] === 'y') { tokens.push({ type: 'var', name: 'y' }); i++ }
    else if ('+-*/^()'.includes(src[i])) { tokens.push({ type: 'op', value: src[i] }); i++ }
    else throw new Error(`Unexpected character: '${src[i]}'`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

function parse(src) {
  const tokens = tokenize(src)
  let pos = 0
  function peek() { return tokens[pos] }
  function consume() { return tokens[pos++] }
  function expect(type, val) {
    const t = consume()
    if (t.type !== type || (val !== undefined && t.value !== val))
      throw new Error(`Expected ${val ?? type}, got ${t.value ?? t.type}`)
    return t
  }

  function parseExpr() {
    let left = parseTerm()
    while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value
      const right = parseTerm()
      left = { kind: op === '+' ? 'add' : 'sub', left, right }
    }
    return left
  }

  function parseTerm() {
    let left = parsePow()
    while (peek().type === 'op' && peek().value === '*') {
      consume()
      const right = parsePow()
      left = { kind: 'mul', left, right }
    }
    return left
  }

  function parsePow() {
    let base = parseAtom()
    if (peek().type === 'op' && peek().value === '^') {
      consume()
      const expTok = consume()
      if (expTok.type !== 'num') throw new Error('Exponent must be a non-negative integer')
      const exp = Number(expTok.value)
      if (exp < 0 || !Number.isInteger(exp)) throw new Error('Exponent must be a non-negative integer')
      base = { kind: 'pow', base, exponent: exp }
    }
    return base
  }

  function parseAtom() {
    const t = peek()
    if (t.type === 'op' && t.value === '-') { consume(); return { kind: 'neg', expr: parsePow() } }
    if (t.type === 'op' && t.value === '(') {
      consume()
      const e = parseExpr()
      expect('op', ')')
      return e
    }
    if (t.type === 'num') { consume(); return { kind: 'const', value: t.value } }
    if (t.type === 'var') { consume(); return { kind: 'var', name: t.name } }
    throw new Error(`Unexpected token: '${t.value ?? t.type}'`)
  }

  const ast = parseExpr()
  if (peek().type !== 'eof') throw new Error('Unexpected token after expression')
  return ast
}

function astToBiPoly(node) {
  switch (node.kind) {
    case 'const': {
      const m = new Map(); if (node.value !== 0n) m.set('0,0', node.value); return m
    }
    case 'var': {
      const m = new Map(); m.set(node.name === 'x' ? '1,0' : '0,1', 1n); return m
    }
    case 'neg': {
      const p = astToBiPoly(node.expr)
      const r = new Map()
      for (const [k, v] of p) r.set(k, -v)
      return r
    }
    case 'add': case 'sub': {
      const a = astToBiPoly(node.left), b = astToBiPoly(node.right)
      const r = new Map(a)
      for (const [k, v] of b) {
        const cur = r.get(k) ?? 0n
        const nv = node.kind === 'add' ? cur + v : cur - v
        if (nv !== 0n) r.set(k, nv); else r.delete(k)
      }
      return r
    }
    case 'mul': {
      const a = astToBiPoly(node.left), b = astToBiPoly(node.right)
      const r = new Map()
      for (const [ka, va] of a) {
        const [ia, ja] = biParsKey(ka)
        for (const [kb, vb] of b) {
          const [ib, jb] = biParsKey(kb)
          const nk = biKey(ia + ib, ja + jb)
          const cur = r.get(nk) ?? 0n
          const nv = cur + va * vb
          if (nv !== 0n) r.set(nk, nv); else r.delete(nk)
        }
      }
      return r
    }
    case 'pow': {
      if (node.exponent === 0) return new Map([['0,0', 1n]])
      let r = astToBiPoly(node.base)
      for (let i = 1; i < node.exponent; i++) r = astToBiPoly({ kind: 'mul', left: node.base, right: { kind: '_poly', _poly: r } })
      return r
    }
    case '_poly': return node._poly
    default: throw new Error(`Unknown AST node: ${node.kind}`)
  }
}

function parseBiPoly(src) {
  const ast = parse(src.trim())
  return astToBiPoly(ast)
}

// ── 6. Input validation ───────────────────────────────────────────────────────

function validateInput(f, g) {
  const errs = []
  if (f.size === 0) errs.push('f is the zero polynomial')
  if (g.size === 0) errs.push('g is the zero polynomial')
  if (degreeTotal(f) === 0) errs.push('f is a nonzero constant — no curve')
  if (degreeTotal(g) === 0) errs.push('g is a nonzero constant — no curve')
  if (degreeTotal(f) > 3) errs.push(`deg(f) = ${degreeTotal(f)} > 3`)
  if (degreeTotal(g) > 3) errs.push(`deg(g) = ${degreeTotal(g)} > 3`)
  if (coeffAbsMax(f) > 20n) errs.push('f has a coefficient with |c| > 20')
  if (coeffAbsMax(g) > 20n) errs.push('g has a coefficient with |c| > 20')
  return errs
}

// ── 7. Resultant & BigInt determinant ─────────────────────────────────────────

// permutation expansion determinant of a matrix of UniPolyBig
function detPolyMatrixBig(M) {
  const n = M.length
  if (n === 0) return [1n]
  if (n === 1) return M[0][0] !== undefined ? M[0] : [1n]

  // generate all permutations with sign
  function* perms(arr) {
    if (arr.length <= 1) { yield { perm: arr, sign: 1 }; return }
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.filter((_, j) => j !== i)
      for (const { perm, sign } of perms(rest))
        yield { perm: [arr[i], ...perm], sign: i % 2 === 0 ? sign : -sign }
    }
  }

  let result = [0n]
  const indices = Array.from({ length: n }, (_, i) => i)
  for (const { perm, sign } of perms(indices)) {
    let term = [sign > 0 ? 1n : -1n]
    let zero = false
    for (let i = 0; i < n; i++) {
      const entry = M[i][perm[i]] ?? [0n]
      const te = trimUniBig(entry)
      if (te.length === 1 && te[0] === 0n) { zero = true; break }
      term = mulUniBig(term, te)
    }
    if (!zero) result = addUniBig(result, term)
  }
  return trimUniBig(result)
}

// Build Sylvester matrix; fCoeffs and gCoeffs are ascending UniPolyBig[] in variable y
// We view each entry as a polynomial in y; matrix entries are UniPolyBig
function buildSylvesterMatrix(fCoeffs, gCoeffs) {
  const m = fCoeffs.length - 1  // deg in elimVar for f
  const n = gCoeffs.length - 1  // deg in elimVar for g
  // Use descending internally: reverse arrays so index 0 = leading coeff
  const fa = [...fCoeffs].reverse()
  const ga = [...gCoeffs].reverse()

  const size = m + n
  const M = []
  for (let i = 0; i < size; i++) M.push(Array(size).fill(null).map(() => [0n]))

  // rows 0..n-1: n shifted copies of f
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= m; j++) M[i][i + j] = fa[j] ?? [0n]
  }
  // rows n..n+m-1: m shifted copies of g
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= n; j++) M[n + i][i + j] = ga[j] ?? [0n]
  }
  return M
}

// computeResultant(f, g, elimVar): eliminates elimVar from f,g
// returns UniPolyBig in the OTHER variable, or null if zero
function computeResultant(f, g, elimVar) {
  const fCoeffs = elimVar === 'x' ? coeffsInX(f) : coeffsInY(f)
  const gCoeffs = elimVar === 'x' ? coeffsInX(g) : coeffsInY(g)

  if (fCoeffs.length <= 1 || gCoeffs.length <= 1) return null  // one poly independent of elimVar

  const M = buildSylvesterMatrix(fCoeffs, gCoeffs)
  const det = detPolyMatrixBig(M)
  const trimmed = trimUniBig(det)
  if (trimmed.length === 1 && trimmed[0] === 0n) return null
  return trimmed
}

// ── 8. Root finding: Durand-Kerner ────────────────────────────────────────────

function polyRoots(coeffsAscending) {
  // accepts bigint[] or number[]
  const warnings = []
  let coeffs = coeffsAscending.map(c => typeof c === 'bigint' ? Number(c) : Number(c))

  // trim leading near-zero
  while (coeffs.length > 1 && Math.abs(coeffs[coeffs.length - 1]) < 1e-300) coeffs.pop()

  const deg = coeffs.length - 1
  if (deg === 0) return { roots: [], converged: true, maxResidual: 0, warnings }
  if (deg === 1) {
    const root = C(-coeffs[0] / coeffs[1])
    const res = Math.abs(coeffs[0] + coeffs[1] * root.re)
    return { roots: [root], converged: true, maxResidual: res, warnings }
  }

  // normalize: scale + monic
  const scale = Math.max(...coeffs.map(Math.abs))
  if (scale === 0) return { roots: [], converged: true, maxResidual: 0, warnings }
  const normed = coeffs.map(c => c / scale)
  const leading = normed[normed.length - 1]
  const monic = normed.map(c => c / leading)

  if (!isFinite(monic[0])) {
    warnings.push('large resultant coefficients; numerical roots may be unstable')
  }

  const complexCoeffs = monic.map(c => C(c))
  return complexPolyRoots(complexCoeffs, warnings)
}

function complexPolyRoots(coeffs, warnings = []) {
  const raw = trimUniComplex(coeffs)
  const deg = degreeUni(raw)
  if (deg === 0) return { roots: [], converged: true, maxResidual: 0, warnings }
  if (deg === 1) {
    const root = cDiv(cNeg(raw[0]), raw[1])
    const res = cAbs(evalUniComplex(raw, root))
    return { roots: [root], converged: true, maxResidual: res, warnings }
  }

  // Durand-Kerner requires a monic polynomial: divide through by leading coeff.
  const lead = raw[deg]
  const trimmed = raw.map(c => cDiv(c, lead))

  // Cauchy radius (trimmed is monic, an = 1)
  let R = 0
  for (let i = 0; i < deg; i++) R = Math.max(R, cAbs(trimmed[i]))
  R = 1 + R

  // initial roots
  const roots = []
  for (let k = 0; k < deg; k++) {
    const theta = 2 * Math.PI * k / deg + 0.123
    roots.push(cFromPolar(R, theta))
  }

  let converged = false
  let maxStep = Infinity

  for (let iter = 0; iter < DK_MAX_ITER && !converged; iter++) {
    maxStep = 0
    for (let k = 0; k < deg; k++) {
      const pk = evalUniComplex(trimmed, roots[k])
      let denom = C(1)
      let denomTooSmall = false
      for (let j = 0; j < deg; j++) {
        if (j === k) continue
        const diff = cSub(roots[k], roots[j])
        if (cAbs(diff) < DK_DENOM_TOL) { denomTooSmall = true; break }
        denom = cMul(denom, diff)
      }
      if (denomTooSmall) {
        // small jitter
        roots[k] = cAdd(roots[k], C(1e-10 * (Math.random() - 0.5), 1e-10 * (Math.random() - 0.5)))
        if (!warnings.includes('root solver collision; applied jitter'))
          warnings.push('root solver collision; applied jitter')
        continue
      }
      const delta = cDiv(pk, denom)
      roots[k] = cSub(roots[k], delta)
      maxStep = Math.max(maxStep, cAbs(delta))
    }

    const maxRes = Math.max(...roots.map(r => cAbs(evalUniComplex(trimmed, r))))
    if (maxStep < DK_STEP_TOL || maxRes < DK_RESIDUAL_TOL) { converged = true; break }
  }

  if (!converged) warnings.push('root solver did not fully converge')

  // residual validation
  const maxResidual = Math.max(...roots.map(r => cAbs(evalUniComplex(trimmed, r))))
  if (maxResidual > ROOT_RESIDUAL_TOL * 10)
    warnings.push('some polynomial roots have large residual')

  return { roots, converged, maxResidual, warnings }
}

// ── 9. Affine intersection solver ─────────────────────────────────────────────

function solveAffine(f, g) {
  const warnings = []
  let points = []
  let eliminationUsed = null
  let resultantDegree = null

  const dxF = degreeX(f), dxG = degreeX(g)
  const dyF = degreeY(f), dyG = degreeY(g)
  const scoreX = dxF + dxG
  const scoreY = dyF + dyG

  // Try both elimination directions
  const order = scoreX <= scoreY ? ['y', 'x'] : ['x', 'y']
  // eliminating 'y' means R(x), so the resultant variable is x → we find x-roots then sub y

  let solved = false
  for (const primary of order) {
    if (solved) break
    const result = tryElimination(f, g, primary, warnings)
    if (result !== null) {
      points = result.points
      eliminationUsed = primary
      resultantDegree = result.resultantDegree
      solved = true
    }
  }

  if (!solved) {
    warnings.push('both elimination directions failed; possible common component or projection degeneracy')
  }

  return { points, eliminationUsed, resultantDegree, warnings }
}

// elimVar: variable to ELIMINATE
// returns univariate resultant in the OTHER variable
function tryElimination(f, g, elimVar, warnings) {
  const otherVar = elimVar === 'x' ? 'y' : 'x'
  const fCoeffsElim = elimVar === 'x' ? coeffsInX(f) : coeffsInY(f)
  const gCoeffsElim = elimVar === 'x' ? coeffsInX(g) : coeffsInY(g)

  const fDegElim = fCoeffsElim.length - 1
  const gDegElim = gCoeffsElim.length - 1

  // Special case: one polynomial is independent of elimVar
  if (fDegElim === 0 && gDegElim === 0) return null  // both independent → try other direction

  if (fDegElim === 0) {
    // f is independent of elimVar: f(otherVar)=0, then solve g in elimVar
    return solveIndependent(f, g, otherVar, warnings)
  }
  if (gDegElim === 0) {
    return solveIndependent(g, f, otherVar, warnings)
  }

  // General case: build Sylvester matrix, compute resultant
  const R = computeResultant(f, g, elimVar)
  if (R === null) {
    warnings.push(`resultant zero in ${elimVar}-elimination direction`)
    return null
  }

  const resultantDegree = degreeUni(R)
  const rootResult = polyRoots(R)
  for (const w of rootResult.warnings) if (!warnings.includes(w)) warnings.push(w)

  const candidates = []
  for (const otherRoot of rootResult.roots) {
    // substitute otherRoot into f and g to get univariate in elimVar
    const fSub = substituteOtherVar(f, otherVar, otherRoot)  // UniPolyComplex in elimVar
    const gSub = substituteOtherVar(g, otherVar, otherRoot)

    // choose better polynomial for root-finding
    const fDeg = degreeUni(trimUniComplex(fSub))
    const gDeg = degreeUni(trimUniComplex(gSub))
    const source = fDeg >= gDeg ? fSub : gSub

    const elimRoots = complexPolyRoots(source)
    for (const w of elimRoots.warnings) if (!warnings.includes(w)) warnings.push(w)

    for (const elimRoot of elimRoots.roots) {
      const [x, y] = elimVar === 'x' ? [elimRoot, otherRoot] : [otherRoot, elimRoot]
      candidates.push({ x, y })
    }
  }

  return { points: filterAndRefine(f, g, candidates, warnings), resultantDegree }
}

// polyFixed depends only on fixedVar, so polyFixed(fixedVar)=0 gives fixedVar roots;
// for each, solve polyOther in the remaining variable.
function solveIndependent(polyFixed, polyOther, fixedVar, warnings) {
  // polyFixed is purely a function of fixedVar → pull out its univariate coefficients
  const fixedUni = fixedVar === 'x'
    ? (coeffsInY(polyFixed)[0] ?? [0n])   // y^0 coefficient = polynomial in x
    : (coeffsInX(polyFixed)[0] ?? [0n])   // x^0 coefficient = polynomial in y
  const fixedCoeffsComplex = convertBigToComplex(trimUniBig(fixedUni))
  const fixedRoots = complexPolyRoots(fixedCoeffsComplex)
  for (const w of fixedRoots.warnings) if (!warnings.includes(w)) warnings.push(w)

  const candidates = []
  for (const fixedRoot of fixedRoots.roots) {
    const otherSub = substituteOtherVar(polyOther, fixedVar, fixedRoot)
    const elimRoots = complexPolyRoots(otherSub)
    for (const w of elimRoots.warnings) if (!warnings.includes(w)) warnings.push(w)

    for (const freeRoot of elimRoots.roots) {
      const [x, y] = fixedVar === 'x' ? [fixedRoot, freeRoot] : [freeRoot, fixedRoot]
      candidates.push({ x, y })
    }
  }

  return { points: filterAndRefine(polyFixed, polyOther, candidates, warnings), resultantDegree: degreeUni(fixedCoeffsComplex) }
}

// substitute the "other" variable with a complex value, returning UniPolyComplex in "elim" variable
function substituteOtherVar(poly, otherVar, otherVal) {
  // collect coefficients as polynomials in the remaining (elim) variable
  // substituting otherVar=otherVal: write poly as sum_k coeff_k(remainingVar)*otherVar^k
  const coeffsOfElim = otherVar === 'x' ? coeffsInX(poly) : coeffsInY(poly)
  // coeffsOfElim[k] is UniPolyBig in elim variable, multiplied by (otherVar)^k
  // evaluate at otherVal: sum over k of (otherVal^k * coeffsOfElim[k])
  let result = []
  let otherPow = C(1)
  for (let k = 0; k < coeffsOfElim.length; k++) {
    const ck = convertBigToComplex(coeffsOfElim[k] ?? [0n])
    const scaled = ck.map(c => cMul(c, otherPow))
    // add to result
    while (result.length < scaled.length) result.push(C(0))
    for (let i = 0; i < scaled.length; i++) result[i] = cAdd(result[i], scaled[i])
    otherPow = cMul(otherPow, otherVal)
  }
  if (result.length === 0) result = [C(0)]
  return trimUniComplex(result)
}

function filterAndRefine(f, g, candidates, warnings) {
  const passed = []
  for (const { x, y } of candidates) {
    // A joint solution must satisfy BOTH curves. Reject if EITHER residual is large —
    // a point on f=0 but far from g=0 is not an intersection, and letting it through
    // would let Newton drag it onto a real solution and create a spurious duplicate.
    const rf0 = cAbs(evalBiPolyComplex(f, x, y))
    const rg0 = cAbs(evalBiPolyComplex(g, x, y))
    if (rf0 > 1e-3 || rg0 > 1e-3) continue

    const refined = newtonRefine(f, g, x, y, warnings)

    // Verify the refined point is still a joint solution before keeping it.
    const rf = cAbs(evalBiPolyComplex(f, refined.x, refined.y))
    const rg = cAbs(evalBiPolyComplex(g, refined.x, refined.y))
    if (rf < INTERSECTION_RESIDUAL_TOL && rg < INTERSECTION_RESIDUAL_TOL) {
      passed.push(refined)
    }
  }
  return passed
}

// ── 10. Newton refinement ─────────────────────────────────────────────────────

function newtonRefine(f, g, x0, y0, warnings = []) {
  const dfx = partialX(f), dfy = partialY(f)
  const dgx = partialX(g), dgy = partialY(g)

  let x = x0, y = y0
  let prevResidual = Infinity

  for (let iter = 0; iter < NEWTON_MAX_ITER; iter++) {
    const fv = evalBiPolyComplex(f, x, y)
    const gv = evalBiPolyComplex(g, x, y)
    const res = Math.max(cAbs(fv), cAbs(gv))

    if (res > prevResidual * 10 && iter > 0) break  // diverging
    prevResidual = res

    const fx = evalBiPolyComplex(dfx, x, y)
    const fy = evalBiPolyComplex(dfy, x, y)
    const gx = evalBiPolyComplex(dgx, x, y)
    const gy = evalBiPolyComplex(dgy, x, y)

    const det = cSub(cMul(fx, gy), cMul(fy, gx))
    if (cAbs(det) < JACOBIAN_TOL) {
      if (!warnings.includes('near-singular Jacobian; possible tangency or multiplicity'))
        warnings.push('near-singular Jacobian; possible tangency or multiplicity')
      break
    }

    // J^{-1} * [-f, -g]
    const dx = cDiv(cSub(cMul(cNeg(fv), gy), cMul(cNeg(gv), fy)), det)
    const dy = cDiv(cSub(cMul(fx, cNeg(gv)), cMul(gx, cNeg(fv))), det)

    x = cAdd(x, dx)
    y = cAdd(y, dy)

    if (cAbs(dx) < NEWTON_STEP_TOL && cAbs(dy) < NEWTON_STEP_TOL) break
  }

  return { x, y, warnings }
}

// ── 11. Dedup / conjugate pairing / classification ────────────────────────────

function dedupAffinePoints(pts) {
  const kept = []
  for (const p of pts) {
    let merged = false
    for (const k of kept) {
      const dx = cAbs(cSub(p.x, k.x)), dy = cAbs(cSub(p.y, k.y))
      const dist = Math.hypot(dx, dy)
      if (dist < POINT_DEDUP_TOL) {
        // merge: average
        k.x = cScale(cAdd(k.x, p.x), 0.5)
        k.y = cScale(cAdd(k.y, p.y), 0.5)
        k.warnings = [...new Set([...k.warnings, ...p.warnings])]
        k._clusterCount = (k._clusterCount ?? 1) + 1
        merged = true; break
      }
    }
    if (!merged) kept.push({ ...p, _clusterCount: 1 })
  }
  // warn on clusters
  for (const k of kept) {
    if ((k._clusterCount ?? 1) > 1 && !k.warnings.includes('clustered intersection; possible multiplicity or tangency'))
      k.warnings.push('clustered intersection; possible multiplicity or tangency')
  }
  return kept
}

function classifyAffinePoint(x, y) {
  if (Math.abs(x.im) < REAL_TOL && Math.abs(y.im) < REAL_TOL) return 'real-affine'
  return 'complex-affine'
}

function checkConjugatePairs(pts, warnings) {
  const used = new Set()
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue
    const p = pts[i]
    if (classifyAffinePoint(p.x, p.y) !== 'complex-affine') continue
    const cx = cConj(p.x), cy = cConj(p.y)
    let found = false
    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j)) continue
      const q = pts[j]
      if (cAbs(cSub(q.x, cx)) < POINT_DEDUP_TOL * 10 && cAbs(cSub(q.y, cy)) < POINT_DEDUP_TOL * 10) {
        used.add(i); used.add(j); found = true; break
      }
    }
    if (!found && !warnings.includes('missing conjugate partner; numerical solver may be unstable'))
      warnings.push('missing conjugate partner; numerical solver may be unstable')
  }
}

// ── 12. Leading homogeneous parts & infinity solver ───────────────────────────

// evaluate f_d(1, t) where fd is the leading homogeneous part as a UniPolyBig in t
function homogToUniY(fd) {
  // fd(1,t): collect coefficients of t^j from entries (i,j) where i+j=d
  // entry (i,j): fd contributes c*1^i*t^j = c*t^j
  const d = degreeTotal(fd)
  const coeffs = new Array(d + 1).fill(0n)
  for (const [k, cv] of fd) {
    const [, j] = biParsKey(k)
    coeffs[j] += cv
  }
  return trimUniBig(coeffs)
}

// evaluate f_d(s, 1): collect coefficients of s^i
function homogToUniX(fd) {
  const d = degreeTotal(fd)
  const coeffs = new Array(d + 1).fill(0n)
  for (const [k, cv] of fd) {
    const [i] = biParsKey(k)
    coeffs[i] += cv
  }
  return trimUniBig(coeffs)
}

function solveInfinity(f, g) {
  const warnings = []
  const fd = leadingHomogeneousPart(f)
  const ge = leadingHomogeneousPart(g)

  if (fd.size === 0 || ge.size === 0) {
    warnings.push('leading forms vanish identically; infinity computation degenerate')
    return { points: [], warnings }
  }

  const candidates = []

  // Chart A: X=1, t=Y/X.  F_inf(t)=f_d(1,t), G_inf(t)=g_e(1,t)
  const FinfY = homogToUniY(fd)  // UniPolyBig in t
  const GinfY = homogToUniY(ge)

  const FinfYc = convertBigToComplex(FinfY)
  const GinfYc = convertBigToComplex(GinfY)

  const useFforChartA = degreeUni(trimUniComplex(FinfYc)) >= degreeUni(trimUniComplex(GinfYc))

  const sourceA = useFforChartA ? FinfYc : GinfYc
  const checkA  = useFforChartA ? GinfYc : FinfYc

  const rootsA = complexPolyRoots(sourceA)
  for (const w of rootsA.warnings) if (!warnings.includes(w)) warnings.push(w)

  for (const t of rootsA.roots) {
    const residual = cAbs(evalUniComplex(checkA, t))
    if (residual < INF_DEDUP_TOL * 100) {
      candidates.push({ X: C(1), Y: t, chart: 'X=1' })
    }
  }

  // Chart B: Y=1, s=X/Y.  F_inf_B(s)=f_d(s,1), G_inf_B(s)=g_e(s,1)
  const FinfX = homogToUniX(fd)
  const GinfX = homogToUniX(ge)

  const FinfXc = convertBigToComplex(FinfX)
  const GinfXc = convertBigToComplex(GinfX)

  const useFforChartB = degreeUni(trimUniComplex(FinfXc)) >= degreeUni(trimUniComplex(GinfXc))
  const sourceB = useFforChartB ? FinfXc : GinfXc
  const checkB  = useFforChartB ? GinfXc : FinfXc

  const rootsB = complexPolyRoots(sourceB)
  for (const w of rootsB.warnings) if (!warnings.includes(w)) warnings.push(w)

  for (const s of rootsB.roots) {
    const residual = cAbs(evalUniComplex(checkB, s))
    if (residual < INF_DEDUP_TOL * 100) {
      candidates.push({ X: s, Y: C(1), chart: 'Y=1' })
    }
  }

  // Projective dedup: [X1:Y1:0] == [X2:Y2:0] iff X1*Y2 - Y1*X2 ≈ 0
  const kept = []
  for (const c of candidates) {
    let dup = false
    // normalize
    const cNorm = normalizeInfPt(c)
    for (const k of kept) {
      const kNorm = normalizeInfPt(k)
      const cross = cSub(cMul(cNorm.X, kNorm.Y), cMul(cNorm.Y, kNorm.X))
      if (cAbs(cross) < INF_DEDUP_TOL) { dup = true; break }
    }
    if (!dup) kept.push(c)
  }

  // Classify
  const points = kept.map(p => {
    const pn = normalizeInfPt(p)
    const isReal = Math.abs(pn.X.im) < REAL_TOL && Math.abs(pn.Y.im) < REAL_TOL
    return {
      X: pn.X, Y: pn.Y,
      Z: C(0),
      kind: isReal ? 'real-infinity' : 'complex-infinity',
      chart: p.chart,
      warnings: []
    }
  })

  return { points, warnings }
}

function normalizeInfPt({ X, Y }) {
  if (cAbs(X) >= cAbs(Y)) {
    if (cAbs(X) < 1e-300) return { X: C(1), Y: C(0) }
    return { X: C(1), Y: cDiv(Y, X) }
  } else {
    if (cAbs(Y) < 1e-300) return { X: C(0), Y: C(1) }
    return { X: cDiv(X, Y), Y: C(1) }
  }
}

// ── 13. Canvas rendering ──────────────────────────────────────────────────────

const canvas = document.getElementById('canvas')
const tooltip = document.getElementById('bezout-tooltip')

function prep() {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.parentElement.getBoundingClientRect()
  const W = Math.floor(rect.width)
  const H = Math.floor(rect.height)
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  return [ctx, W, H]
}

function computeLayout(W, H) {
  const cx = W / 2, cy = H / 2
  const radius = Math.min(W, H) * 0.44
  const margin = radius * 0.62  // inner rect fits inside circle
  const innerRect = {
    left:   cx - margin,
    top:    cy - margin,
    right:  cx + margin,
    bottom: cy + margin,
    width:  2 * margin,
    height: 2 * margin,
    cx, cy
  }
  return { cx, cy, radius, innerRect }
}

function affinePtToCanvas(ax, ay, vp, innerRect) {
  const tx = (ax - vp.xmin) / (vp.xmax - vp.xmin)
  const ty = (ay - vp.ymin) / (vp.ymax - vp.ymin)
  return {
    px: innerRect.left + tx * innerRect.width,
    py: innerRect.bottom - ty * innerRect.height
  }
}

function marchingSquares(poly, vp, N = GRID_N) {
  const dx = (vp.xmax - vp.xmin) / N
  const dy = (vp.ymax - vp.ymin) / N
  // Nudge sampling by an irrational sub-cell fraction so grid vertices never land
  // exactly on symmetric zeros (e.g. a vertex at the origin sitting on a grid line),
  // which would make the sign test degenerate. Shift is ~1e-3 of a cell → invisible.
  const ox = dx * 1.7e-3
  const oy = dy * 1.3e-3
  const grid = []
  for (let j = 0; j <= N; j++) {
    grid.push([])
    for (let i = 0; i <= N; i++) {
      const x = vp.xmin + i * dx + ox
      const y = vp.ymin + j * dy + oy
      // Evaluate using real arithmetic (faster for rendering)
      let val = 0
      for (const [k, cv] of poly) {
        const [pi, pj] = biParsKey(k)
        val += Number(cv) * Math.pow(x, pi) * Math.pow(y, pj)
      }
      grid[j].push(val)
    }
  }

  const segments = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v00 = grid[j][i], v10 = grid[j][i + 1]
      const v01 = grid[j + 1][i], v11 = grid[j + 1][i + 1]
      const x0 = vp.xmin + i * dx + ox, x1 = x0 + dx
      const y0 = vp.ymin + j * dy + oy, y1 = y0 + dy

      // linear interpolation along edge
      function interp(a, b, va, vb) { return a + (b - a) * (-va / (vb - va)) }

      // bits: v00=8 (bottom-left), v10=4 (bottom-right), v11=2 (top-right), v01=1 (top-left)
      const s = (v00 < 0 ? 8 : 0) | (v10 < 0 ? 4 : 0) | (v11 < 0 ? 2 : 0) | (v01 < 0 ? 1 : 0)

      // each lambda interpolates the contour crossing along one cell edge
      const bottom = () => [interp(x0, x1, v00, v10), y0]  // BL→BR
      const top    = () => [interp(x0, x1, v01, v11), y1]  // TL→TR
      const left   = () => [x0, interp(y0, y1, v00, v01)]  // BL→TL
      const right  = () => [x1, interp(y0, y1, v10, v11)]  // BR→TR

      const addSeg = (a, b) => segments.push([a[0], a[1], b[0], b[1]])

      switch (s) {
        case 1: case 14: addSeg(left(), top());     break  // TL isolated
        case 2: case 13: addSeg(top(), right());    break  // TR isolated
        case 3: case 12: addSeg(left(), right());   break  // top/bottom row split
        case 4: case 11: addSeg(bottom(), right()); break  // BR isolated
        case 6: case 9:  addSeg(bottom(), top());   break  // left/right column split
        case 7: case 8:  addSeg(bottom(), left());  break  // BL isolated
        case 5: {  // TL & BR negative — saddle; center sign picks connectivity
          if (v00 + v10 + v11 + v01 < 0) { addSeg(bottom(), left()); addSeg(top(), right()) }
          else { addSeg(left(), top()); addSeg(bottom(), right()) }
          break
        }
        case 10: {  // BL & TR negative — saddle
          if (v00 + v10 + v11 + v01 < 0) { addSeg(left(), top()); addSeg(bottom(), right()) }
          else { addSeg(bottom(), left()); addSeg(top(), right()) }
          break
        }
      }
    }
  }
  return segments
}

function render() {
  const [ctx, W, H] = prep()
  const { cx, cy, radius, innerRect } = computeLayout(W, H)
  const vp = state.viewport

  ctx.clearRect(0, 0, W, H)

  // Layer 1: background (inherited from body)

  // Layer 2: affine rectangle
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(innerRect.left, innerRect.top, innerRect.width, innerRect.height)
  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.font = '10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`x: [${vp.xmin}, ${vp.xmax}]`, cx, innerRect.bottom + 14)
  ctx.textAlign = 'left'
  ctx.fillText(`y: [${vp.ymin}, ${vp.ymax}]`, innerRect.right + 6, cy + 4)
  ctx.restore()

  // Layer 3: infinity circle
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.setLineDash([])
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.font = '9px JetBrains Mono, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('RP¹ (line at ∞)', cx, cy - radius - 6)
  ctx.restore()

  const result = state.result
  if (!result || !result.valid) {
    // Draw empty canvas with hint
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.font = '13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Enter polynomials and press Compute', cx, cy)
    ctx.restore()
    return
  }

  const { fPoly, gPoly, affinePoints, infinityPoints } = result

  // Layer 4: real curves (marching squares)
  const segF = marchingSquares(fPoly, vp)
  const segG = marchingSquares(gPoly, vp)

  function drawCurveSegs(segs, color) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (const [x1, y1, x2, y2] of segs) {
      const p1 = affinePtToCanvas(x1, y1, vp, innerRect)
      const p2 = affinePtToCanvas(x2, y2, vp, innerRect)
      ctx.moveTo(p1.px, p1.py)
      ctx.lineTo(p2.px, p2.py)
    }
    ctx.stroke()
    ctx.restore()
  }

  // Clip to inner rect for curve drawing
  ctx.save()
  ctx.beginPath()
  ctx.rect(innerRect.left - 1, innerRect.top - 1, innerRect.width + 2, innerRect.height + 2)
  ctx.clip()
  drawCurveSegs(segF, 'rgba(100, 180, 255, 0.75)')
  drawCurveSegs(segG, 'rgba(255, 175, 100, 0.75)')
  ctx.restore()

  // Layer 5-6: complex affine shadow lines + ghost points
  if (state.showComplexShadows) {
    for (const pt of affinePoints) {
      if (pt.kind !== 'complex-affine') continue
      const sx = pt.x.re, sy = pt.y.re  // shadow
      const sc = affinePtToCanvas(sx, sy, vp, innerRect)

      // shadow dot
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#ff88cc'
      ctx.beginPath()
      ctx.arc(sc.px, sc.py, 4, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()

      // connector between conjugate pair
      if (pt._conjugate) {
        const cx2 = pt._conjugate.x.re, cy2 = pt._conjugate.y.re
        const sc2 = affinePtToCanvas(cx2, cy2, vp, innerRect)
        ctx.save()
        ctx.globalAlpha = 0.2
        ctx.strokeStyle = '#ff88cc'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(sc.px, sc.py)
        ctx.lineTo(sc2.px, sc2.py)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
    }
  }

  // Layer 7: real affine dots
  for (const pt of affinePoints) {
    if (pt.kind !== 'real-affine') continue
    const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
    // glow
    const grad = ctx.createRadialGradient(px, py, 0, px, py, 8)
    grad.addColorStop(0, 'rgba(255,255,255,0.3)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath(); ctx.arc(px, py, 8, 0, 2 * Math.PI)
    ctx.fillStyle = grad; ctx.fill()
    // dot
    ctx.beginPath(); ctx.arc(px, py, 4, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke()
  }

  // Layer 8: infinity markers
  if (state.showInfinityPoints) {
    for (const pt of infinityPoints) {
      const norm = normalizeInfPt(pt)
      if (pt.kind === 'real-infinity') {
        const theta = Math.atan2(norm.Y.re, norm.X.re)
        drawRealInfinityPt(ctx, cx, cy, radius, theta)
      } else {
        // complex infinity: shadow direction
        let shadowTheta
        if (cAbs(norm.X) >= cAbs(norm.Y)) {
          const t = cDiv(norm.Y, norm.X)
          shadowTheta = Math.atan2(t.re, 1)
        } else {
          const s = cDiv(norm.X, norm.Y)
          shadowTheta = Math.atan2(1, s.re)
        }
        drawComplexInfinityPt(ctx, cx, cy, radius, shadowTheta)
      }
    }
  }
}

function drawRealInfinityPt(ctx, cx, cy, radius, theta) {
  for (const t of [theta, theta + Math.PI]) {
    const px = cx + radius * Math.cos(t)
    const py = cy - radius * Math.sin(t)
    ctx.save()
    ctx.fillStyle = '#44e2cd'
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 5, 0, 2 * Math.PI)
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
}

function drawComplexInfinityPt(ctx, cx, cy, radius, shadowTheta) {
  for (const t of [shadowTheta, shadowTheta + Math.PI]) {
    const px = cx + radius * Math.cos(t)
    const py = cy - radius * Math.sin(t)
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffafd3'
    ctx.strokeStyle = 'rgba(255,175,211,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, 2 * Math.PI)
    ctx.fill(); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

// ── 14. Tooltip hit-testing ────────────────────────────────────────────────────

function findNearestPoint(mouseX, mouseY, W, H) {
  if (!state.result || !state.result.valid) return null
  const { cx, cy, radius, innerRect } = computeLayout(W, H)
  const vp = state.viewport
  const HIT_R = 12

  const all = []

  for (const pt of state.result.affinePoints) {
    if (pt.kind === 'real-affine') {
      const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
      all.push({ pt, px, py })
    } else if (state.showComplexShadows) {
      const { px, py } = affinePtToCanvas(pt.x.re, pt.y.re, vp, innerRect)
      all.push({ pt, px, py })
    }
  }

  if (state.showInfinityPoints) {
    for (const pt of state.result.infinityPoints) {
      const norm = normalizeInfPt(pt)
      let theta
      if (pt.kind === 'real-infinity') {
        theta = Math.atan2(norm.Y.re, norm.X.re)
      } else {
        if (cAbs(norm.X) >= cAbs(norm.Y)) {
          theta = Math.atan2(cDiv(norm.Y, norm.X).re, 1)
        } else {
          theta = Math.atan2(1, cDiv(norm.X, norm.Y).re)
        }
      }
      const px = cx + radius * Math.cos(theta)
      const py = cy - radius * Math.sin(theta)
      all.push({ pt, px, py })
    }
  }

  let best = null, bestDist = HIT_R
  for (const item of all) {
    const d = Math.hypot(mouseX - item.px, mouseY - item.py)
    if (d < bestDist) { bestDist = d; best = item }
  }
  return best ? best.pt : null
}

function fmtComplex(z, digits = 4) {
  if (Math.abs(z.im) < REAL_TOL) return z.re.toFixed(digits)
  const sign = z.im >= 0 ? '+' : '−'
  return `${z.re.toFixed(3)} ${sign} ${Math.abs(z.im).toFixed(3)}i`
}

function buildTooltipHTML(pt) {
  if (!pt) return ''
  let html = ''
  if (pt.kind === 'real-affine') {
    html += `<div class="tt-type" style="color:#fff">Real Affine</div>`
    html += `<div class="tt-coord">x ≈ ${fmtComplex(pt.x)}</div>`
    html += `<div class="tt-coord">y ≈ ${fmtComplex(pt.y)}</div>`
  } else if (pt.kind === 'complex-affine') {
    html += `<div class="tt-type" style="color:#ff88cc">Complex Affine</div>`
    html += `<div class="tt-coord">x ≈ ${fmtComplex(pt.x)}</div>`
    html += `<div class="tt-coord">y ≈ ${fmtComplex(pt.y)}</div>`
    html += `<div class="tt-coord" style="opacity:0.6">shadow ≈ (${pt.x.re.toFixed(3)}, ${pt.y.re.toFixed(3)})</div>`
    html += `<div class="tt-warn">Complex intersection. Shadow = real-part projection.</div>`
  } else if (pt.kind === 'real-infinity') {
    const n = normalizeInfPt(pt)
    html += `<div class="tt-type" style="color:#44e2cd">Real Infinity</div>`
    html += `<div class="tt-coord">[${fmtComplex(n.X, 3)} : ${fmtComplex(n.Y, 3)} : 0]</div>`
    html += `<div class="tt-warn">Antipodal pair = one projective point.</div>`
  } else if (pt.kind === 'complex-infinity') {
    const n = normalizeInfPt(pt)
    html += `<div class="tt-type" style="color:#ffafd3">Complex Infinity</div>`
    html += `<div class="tt-coord">[${fmtComplex(n.X, 3)} : ${fmtComplex(n.Y, 3)} : 0]</div>`
    html += `<div class="tt-warn">Non-real point at infinity. Position shown is a chart-dependent real shadow.</div>`
  }
  if (pt.warnings && pt.warnings.length) {
    for (const w of pt.warnings) html += `<div class="tt-warn">⚠ ${w}</div>`
  }
  return html
}

// ── 15. Built-in examples ─────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'line ∩ circle', f: 'x^2 + y^2 - 1', g: '2*y - 1' },
  { label: 'concentric', f: 'x^2 + y^2 - 1', g: 'x^2 + y^2 - 4' },
  { label: 'parabola', f: 'y - x^2', g: 'y + 1' },
  { label: 'tangency', f: 'y', g: 'y - x^2' },
  { label: 'fin+inf', f: 'y - x^2', g: 'y + x^2' },
  { label: 'two lines', f: 'x + y', g: 'x - y' },
  { label: 'parallel', f: 'y', g: 'y - 1' },
  { label: 'vert/horiz', f: 'x', g: 'y^2 - 1' },
]

// ── 16. State & UI ────────────────────────────────────────────────────────────

const state = {
  fStr: 'x^2 + y^2 - 1',
  gStr: '2*y - 1',
  showComplexShadows: true,
  showInfinityPoints: true,
  viewport: { xmin: -3, xmax: 3, ymin: -3, ymax: 3 },
  result: null,
}

const inputF = document.getElementById('input-f')
const inputG = document.getElementById('input-g')
const errorF = document.getElementById('error-f')
const errorG = document.getElementById('error-g')
const errorGlobal = document.getElementById('error-global')
const btnCompute = document.getElementById('btn-compute')
const reportSection = document.getElementById('report-section')
const reportRows = document.getElementById('report-rows')
const warningSection = document.getElementById('warning-section')
const warningList = document.getElementById('warning-list')
const togComplex  = document.getElementById('tog-complex')
const togInfinity = document.getElementById('tog-infinity')
const togWarnings = document.getElementById('tog-warnings')
const exampleGrid = document.getElementById('example-grid')

function clearErrors() {
  errorF.textContent = ''
  errorG.textContent = ''
  errorGlobal.textContent = ''
  inputF.classList.remove('error')
  inputG.classList.remove('error')
}

function compute() {
  clearErrors()

  let fPoly, gPoly
  try { fPoly = parseBiPoly(inputF.value) }
  catch (e) { errorF.textContent = e.message; inputF.classList.add('error'); return }
  try { gPoly = parseBiPoly(inputG.value) }
  catch (e) { errorG.textContent = e.message; inputG.classList.add('error'); return }

  const valErrs = validateInput(fPoly, gPoly)
  if (valErrs.length) {
    errorGlobal.textContent = valErrs.join('; ')
    state.result = null
    render()
    return
  }

  state.fStr = inputF.value
  state.gStr = inputG.value

  const affineResult = solveAffine(fPoly, gPoly)
  const infResult    = solveInfinity(fPoly, gPoly)

  const allWarnings = [...affineResult.warnings, ...infResult.warnings]

  // deduplicate affine points and classify
  const rawPts = affineResult.points.map(p => ({
    x: p.x, y: p.y,
    kind: classifyAffinePoint(p.x, p.y),
    warnings: [...(p.warnings ?? [])],
  }))
  const affinePoints = dedupAffinePoints(rawPts)
  checkConjugatePairs(affinePoints, allWarnings)

  // Link conjugate pairs for rendering
  linkConjugatePairs(affinePoints)

  state.result = {
    valid: true,
    fPoly, gPoly,
    degF: degreeTotal(fPoly),
    degG: degreeTotal(gPoly),
    affinePoints,
    infinityPoints: infResult.points,
    eliminationUsed: affineResult.eliminationUsed,
    resultantDegree: affineResult.resultantDegree,
    warnings: allWarnings,
  }

  updateReport()
  render()
}

function linkConjugatePairs(pts) {
  const used = new Set()
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i) || pts[i].kind !== 'complex-affine') continue
    const cx_ = cConj(pts[i].x), cy_ = cConj(pts[i].y)
    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j) || pts[j].kind !== 'complex-affine') continue
      if (cAbs(cSub(pts[j].x, cx_)) < POINT_DEDUP_TOL * 10 &&
          cAbs(cSub(pts[j].y, cy_)) < POINT_DEDUP_TOL * 10) {
        pts[i]._conjugate = pts[j]
        pts[j]._conjugate = pts[i]
        used.add(i); used.add(j); break
      }
    }
  }
}

function updateReport() {
  if (!state.result) { reportSection.style.display = 'none'; warningSection.style.display = 'none'; return }
  const r = state.result
  const realAffine = r.affinePoints.filter(p => p.kind === 'real-affine').length
  const complexAffine = r.affinePoints.filter(p => p.kind === 'complex-affine').length
  const realInf = r.infinityPoints.filter(p => p.kind === 'real-infinity').length
  const complexInf = r.infinityPoints.filter(p => p.kind === 'complex-infinity').length
  const bezout = r.degF * r.degG

  const rows = [
    ['deg(f)', r.degF],
    ['deg(g)', r.degG],
    ['Bézout bound (d·e)', bezout],
    ['Elimination', r.eliminationUsed ?? '—'],
    ['Resultant deg', r.resultantDegree ?? '—'],
    ['Real affine pts', realAffine],
    ['Complex affine pts', complexAffine],
    ['Real infinity pts', realInf],
    ['Complex infinity pts', complexInf],
  ]

  reportRows.innerHTML = rows.map(([k, v]) =>
    `<div class="bezout-report-row"><span class="bezout-report-key">${k}</span><span class="bezout-report-val">${v}</span></div>`
  ).join('')
  reportSection.style.display = ''

  const warns = togWarnings.checked ? r.warnings : []
  if (warns.length) {
    warningList.innerHTML = warns.map(w => `<li class="bezout-warning-item">${w}</li>`).join('')
    warningSection.style.display = ''
  } else {
    warningSection.style.display = 'none'
  }
}

// Example buttons
for (const ex of EXAMPLES) {
  const btn = document.createElement('button')
  btn.className = 'bezout-example-btn'
  btn.textContent = ex.label
  btn.addEventListener('click', () => {
    inputF.value = ex.f
    inputG.value = ex.g
    compute()
  })
  exampleGrid.appendChild(btn)
}

// Compute button
btnCompute.addEventListener('click', compute)

// Enter key in inputs
for (const inp of [inputF, inputG]) {
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') compute() })
}

// Toggles
togComplex.addEventListener('change', () => { state.showComplexShadows = togComplex.checked; render() })
togInfinity.addEventListener('change', () => { state.showInfinityPoints = togInfinity.checked; render() })
togWarnings.addEventListener('change', () => updateReport())

// Tooltip
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const dpr = window.devicePixelRatio || 1
  const W = canvas.width / dpr, H = canvas.height / dpr
  const pt = findNearestPoint(mx, my, W, H)
  if (pt) {
    tooltip.style.display = 'block'
    tooltip.innerHTML = buildTooltipHTML(pt)
    let tx = mx + 14, ty = my - 10
    const tw = 250, th = 120
    if (tx + tw > W) tx = mx - tw - 10
    if (ty + th > H) ty = my - th
    tooltip.style.left = tx + 'px'
    tooltip.style.top = ty + 'px'
  } else {
    tooltip.style.display = 'none'
  }
})
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })

// Resize
const ro = new ResizeObserver(() => render())
ro.observe(canvas.parentElement)

// Initial compute
compute()
