// bezout_solver_test.js
// Runnable in Node (`node bezout_solver_test.js`) or pasted into a browser console
// after importing solveBezoutSystem.

import { solveBezoutSystem } from './bezout_solver.js'

let passed = 0
let failed = 0

function assert(cond, msg) { if (!cond) throw new Error(msg) }
function test(name, fn) {
  try { fn(); console.log('PASS', name); passed++ }
  catch (err) { console.error('FAIL', name, '\n   ', err.message); failed++ }
}

// ── Test 1. circle and line y = 0 ─────────────────────────────────────────────
test('circle and line y=0', () => {
  const res = solveBezoutSystem('x^2 + y^2 - 1', 'y')
  assert(res.status === 'ok', `status should be ok, got ${res.status}`)
  assert(res.expectedBezoutCount === 2, 'expected count should be 2')
  assert(res.totalMultiplicity === 2, `total multiplicity should be 2, got ${res.totalMultiplicity}`)
  assert(res.points.length === 2, `should have 2 distinct points, got ${res.points.length}`)
  const realAffine = res.points.filter(p => p.type === 'real_affine')
  assert(realAffine.length === 2, 'both points should be real affine')
})

// ── Test 2. two concentric circles ────────────────────────────────────────────
test('two concentric circles', () => {
  const res = solveBezoutSystem('x^2 + y^2 - 1', 'x^2 + y^2 - 4')
  assert(res.status === 'ok', `status should be ok, got ${res.status}`)
  assert(res.expectedBezoutCount === 4, 'expected count should be 4')
  assert(res.totalMultiplicity === 4, `total multiplicity should be 4, got ${res.totalMultiplicity}`)
  assert(res.points.length === 2, `should have 2 distinct projective points, got ${res.points.length}`)
  for (const p of res.points) {
    assert(p.type === 'complex_infinity', `points should be complex infinity, got ${p.type}`)
    assert(p.multiplicity === 2, `each point should have multiplicity 2, got ${p.multiplicity}`)
  }
})

// ── Test 3. tangent intersection y and y - x^2 ────────────────────────────────
test('tangent intersection y and y - x^2', () => {
  const res = solveBezoutSystem('y', 'y - x^2')
  assert(res.status === 'ok', `status should be ok, got ${res.status}`)
  assert(res.expectedBezoutCount === 2, 'expected count should be 2')
  assert(res.totalMultiplicity === 2, `total multiplicity should be 2, got ${res.totalMultiplicity}`)
  assert(res.points.length === 1, `should have one projective point, got ${res.points.length}`)
  assert(res.points[0].multiplicity === 2, `multiplicity should be 2, got ${res.points[0].multiplicity}`)
  assert(res.points[0].type === 'real_affine', `point should be real affine, got ${res.points[0].type}`)
})

// ── Test 4. two coordinate lines ──────────────────────────────────────────────
test('two coordinate lines', () => {
  const res = solveBezoutSystem('x', 'y')
  assert(res.status === 'ok', `status should be ok, got ${res.status}`)
  assert(res.expectedBezoutCount === 1, 'expected count should be 1')
  assert(res.totalMultiplicity === 1, `total multiplicity should be 1, got ${res.totalMultiplicity}`)
  assert(res.points.length === 1, `should have one point, got ${res.points.length}`)
  assert(res.points[0].type === 'real_affine', `point should be real affine, got ${res.points[0].type}`)
})

// ── Test 5. cubic and line ────────────────────────────────────────────────────
test('cubic and line', () => {
  const res = solveBezoutSystem('y - x^3', 'x + y - 1')
  assert(res.status === 'ok', `status should be ok, got ${res.status}`)
  assert(res.expectedBezoutCount === 3, 'expected count should be 3')
  assert(res.totalMultiplicity === 3, `total multiplicity should be 3, got ${res.totalMultiplicity}`)
})

// ── Test 6. common component ──────────────────────────────────────────────────
test('common component', () => {
  const res = solveBezoutSystem('x^2 + y^2 - 1', '(x^2 + y^2 - 1) * (x + y)')
  assert(res.status === 'common_component_suspected', `should detect common component, got ${res.status}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (typeof process !== 'undefined' && failed > 0) process.exitCode = 1
