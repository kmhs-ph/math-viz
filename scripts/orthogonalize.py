#!/usr/bin/env python3
"""
Offline orthogonalization of group representation generator matrices.
Outputs pre-orthogonalized JS matrices and hardcoded preset vectors.
Run from repo root: python3 scripts/orthogonalize.py
"""

import numpy as np

# ─── Permutation group utilities ─────────────────────────────────────────────

def sn_mul(a, b):
    """(a∘b)(i) = a(b(i)) — matches JS snMul(a,b) = b.map(bi => a[bi])"""
    return tuple(a[b[i]] for i in range(len(b)))

def sn_id(p):
    return ','.join(map(str, p))

def perm_inv(p):
    inv = [0] * len(p)
    for i, pi in enumerate(p):
        inv[pi] = i
    return tuple(inv)

def bfs_matrices(generators, gen_mat_dict):
    """
    Enumerate all group elements by BFS right-multiplication.
    Uses generators and their inverses.
    Returns dict: sn_id(elem) -> numpy matrix.
    """
    n = len(generators[0])
    identity = tuple(range(n))
    dim = len(next(iter(gen_mat_dict.values())))

    # Build matrix lookup for all generators and their inverses
    gen_mats = {}
    for g in generators:
        gid = sn_id(g)
        if gid in gen_mat_dict:
            Mg = np.array(gen_mat_dict[gid], dtype=float)
            gen_mats[gid] = Mg
            inv_g = perm_inv(g)
            inv_id = sn_id(inv_g)
            if inv_id not in gen_mats and inv_id not in gen_mat_dict:
                gen_mats[inv_id] = np.linalg.inv(Mg)

    all_gens = [(tuple(map(int, gid.split(','))), M) for gid, M in gen_mats.items()]

    I = np.eye(dim)
    matrices = {sn_id(identity): I}
    queue = [(identity, I)]

    while queue:
        cur, M_cur = queue.pop(0)
        for gen, M_gen in all_gens:
            nxt = sn_mul(cur, gen)
            nid = sn_id(nxt)
            if nid not in matrices:
                matrices[nid] = M_cur @ M_gen
                queue.append((nxt, M_cur @ M_gen))

    return matrices

def orthogonalize_rep(generators, gen_mat_dict, name=""):
    """
    Orthogonalize representation via G-invariant Gram matrix.
    Returns new gen_mat_dict (numpy arrays).
    """
    print(f"\n{'='*60}")
    print(f"  {name}")
    print('='*60)

    all_mats = bfs_matrices(generators, gen_mat_dict)
    print(f"  |G| = {len(all_mats)}")

    dim = len(next(iter(gen_mat_dict.values())))

    # Gram matrix G = (1/|G|) Σ_g M_g^T M_g
    G = np.zeros((dim, dim))
    for M in all_mats.values():
        G += M.T @ M
    G /= len(all_mats)

    max_err = np.max(np.abs(G - np.eye(dim)))
    print(f"  Gram matrix max error from I: {max_err:.2e}")

    if max_err < 1e-8:
        print("  → Already orthogonal, no change.")
        return {k: np.array(v, dtype=float) for k, v in gen_mat_dict.items()}

    # G = V Λ V^T (numpy eigh: columns of V are eigenvectors)
    eigenvalues, V = np.linalg.eigh(G)
    print(f"  Eigenvalues: {np.round(eigenvalues, 8)}")

    # P = V Λ^{-1/2}, P_inv = Λ^{1/2} V^T
    P    = V @ np.diag(1.0 / np.sqrt(eigenvalues))
    Pinv = np.diag(np.sqrt(eigenvalues)) @ V.T

    new_mats = {}
    for gid, M in gen_mat_dict.items():
        N = Pinv @ np.array(M, dtype=float) @ P
        N[np.abs(N) < 1e-11] = 0.0
        new_mats[gid] = N

    # Verify
    all_new = bfs_matrices(generators, {k: v.tolist() for k, v in new_mats.items()})
    G2 = sum(M.T @ M for M in all_new.values()) / len(all_new)
    print(f"  → Error after orthogonalization: {np.max(np.abs(G2 - np.eye(dim))):.2e}")

    return new_mats

# ─── Rotation axis analysis ───────────────────────────────────────────────────

def rot_order(M):
    tr = np.trace(M)
    phi = (1 + np.sqrt(5)) / 2
    if tr > 2.9:                return 1
    if abs(tr + 1) < 0.15:     return 2
    if abs(tr) < 0.15:         return 3
    if abs(tr - 1) < 0.15:     return 4
    if abs(tr - phi) < 0.15 or abs(tr - (1 - phi)) < 0.15: return 5
    return 0

def rot_axis(M, ord):
    if ord == 2:
        N = M + np.eye(3)
        for row in N:
            if np.linalg.norm(row) > 0.01:
                return row / np.linalg.norm(row)
    ax = np.array([M[2,1]-M[1,2], M[0,2]-M[2,0], M[1,0]-M[0,1]])
    l = np.linalg.norm(ax)
    return ax / l if l > 1e-9 else ax

def collect_axes(generators, gen_mat_dict):
    """Find distinct proper-rotation axes grouped by order."""
    all_mats = bfs_matrices(generators, gen_mat_dict)
    by_ord = {}
    for M in all_mats.values():
        if abs(np.linalg.det(M) - 1) > 0.15:
            continue
        ord = rot_order(M)
        if ord <= 1:
            continue
        ax = rot_axis(M, ord)
        if ord not in by_ord:
            by_ord[ord] = []
        if all(abs(np.dot(ax, a)) < 0.99 for a in by_ord[ord]):
            by_ord[ord].append(ax)
    return by_ord

def make_presets(group_key, by_ord):
    def nrm(v): return v / np.linalg.norm(v)
    def u(k, i=0):
        axes = by_ord.get(k, [])
        return axes[i] if i < len(axes) else None
    def has(*ks): return all(u(k) is not None for k in ks)

    ps = [('default (e₁)', None)]

    if group_key == 'A4' and has(3, 2):
        ps += [
            ('Tetrahedron',        u(3)),
            ('Octahedron',         u(2)),
            ('Trunc. tetrahedron', nrm(u(3) + u(2))),
        ]
        if len(by_ord.get(2, [])) >= 2:
            ps.append(('Cuboctahedron',     nrm(u(2,0) + u(2,1))))
        v2b = u(2,1) if len(by_ord.get(2,[])) >= 2 else u(2)
        ps.append(('Icosahedron-type',  nrm(u(3) + u(2,0) + v2b)))

    elif group_key == 'S4' and has(4, 3, 2):
        ps += [
            ('Octahedron',           u(4)),
            ('Cube',                 u(3)),
            ('Cuboctahedron',        u(2)),
            ('Rhombicuboctahedron',  nrm(u(4) + u(3))),
            ('Trunc. octahedron',    nrm(u(4) + u(2))),
            ('Trunc. cube',          nrm(u(3) + u(2))),
            ('Snub cube',            nrm(u(4) + u(3) + u(2))),
        ]

    elif group_key == 'A5' and has(5, 3, 2):
        ps += [
            ('Icosahedron',          u(5)),
            ('Dodecahedron',         u(3)),
            ('Icosidodecahedron',    u(2)),
            ('Trunc. icosahedron',   nrm(u(5) + u(3))),
            ('Trunc. dodecahedron',  nrm(u(5) + u(2))),
            ('Rhombicosidodeca.',    nrm(u(3) + u(2))),
            ('Snub dodecahedron',    nrm(u(5) + u(3) + u(2))),
        ]

    return ps

# ─── Formatting ───────────────────────────────────────────────────────────────

def fmt(v, prec=12):
    """Format a float cleanly for JS."""
    if abs(v) < 1e-11:
        return '0'
    s = f'{v:.{prec}f}'
    # Trim trailing zeros but keep at least 4 significant digits
    s = s.rstrip('0').rstrip('.')
    return s

def fmt_mat(M, indent=10):
    rows = []
    for row in np.asarray(M):
        vals = ', '.join(fmt(v) for v in row)
        rows.append(f'[{vals}]')
    sep = ',\n' + ' ' * indent
    return '[' + sep.join(rows) + ']'

def fmt_v(v):
    if v is None:
        return 'null'
    return '[' + ', '.join(fmt(x) for x in v) + ']'

def print_js_genmat(label, gid_mat_dict):
    print(f"\n  // {label}")
    for gid, M in gid_mat_dict.items():
        print(f"  // gen {gid}")
        print(f"  {fmt_mat(M)}")

def print_presets_js(name, presets):
    print(f"\n  // {name} presets")
    for pname, v in presets:
        print(f"  {{ name: {pname!r}, v: {fmt_v(v)} }},")

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # ── S3 std 2D ────────────────────────────────────────────────────────────
    tau1, tau2 = (1,0,2), (0,2,1)
    s3_gens = [tau1, tau2]
    s3_std_raw = {
        sn_id(tau1): [[-1,1],[0,1]],
        sn_id(tau2): [[1,0],[1,-1]],
    }
    s3_std = orthogonalize_rep(s3_gens, s3_std_raw, "S3 std 2D")
    print_js_genmat("S3 std 2D", s3_std)

    # ── S4 ρ₂ 2D ─────────────────────────────────────────────────────────────
    id12, id23, id34 = (1,0,2,3), (0,2,1,3), (0,1,3,2)
    s4_gens = [id12, id23, id34]
    s4_rho2_raw = {
        sn_id(id12): [[-1,1],[0,1]],
        sn_id(id23): [[1,0],[1,-1]],
        sn_id(id34): [[-1,1],[0,1]],
    }
    s4_rho2 = orthogonalize_rep(s4_gens, s4_rho2_raw, "S4 ρ₂ 2D")
    print_js_genmat("S4 rho2 2D", s4_rho2)

    # ── S4 std 3D ─────────────────────────────────────────────────────────────
    s4_std_raw = {
        sn_id(id12): [[-1,0,0],[1,1,0],[0,0,1]],
        sn_id(id23): [[1,1,0],[0,-1,0],[0,1,1]],
        sn_id(id34): [[1,0,0],[0,1,1],[0,0,-1]],
    }
    s4_std = orthogonalize_rep(s4_gens, s4_std_raw, "S4 std 3D")
    print_js_genmat("S4 std 3D", s4_std)

    # ── S4 std⊗sgn 3D ─────────────────────────────────────────────────────────
    s4_stdsgn_raw = {
        sn_id(id12): [[1,0,0],[-1,-1,0],[0,0,-1]],
        sn_id(id23): [[-1,-1,0],[0,1,0],[0,-1,-1]],
        sn_id(id34): [[-1,0,0],[0,-1,-1],[0,0,1]],
    }
    s4_stdsgn = orthogonalize_rep(s4_gens, s4_stdsgn_raw, "S4 std⊗sgn 3D")
    print_js_genmat("S4 std⊗sgn 3D", s4_stdsgn)

    by_ord_s4sg = collect_axes(s4_gens, {k: v.tolist() for k, v in s4_stdsgn.items()})
    print("\n  S4 std⊗sgn axes by order:")
    for o, axes in sorted(by_ord_s4sg.items()):
        print(f"    C{o}: {len(axes)} distinct, first = {np.round(axes[0], 8)}")
    presets_s4sg = make_presets('S4', by_ord_s4sg)
    print_presets_js("S4 std⊗sgn", presets_s4sg)

    # ── A4 std 3D ─────────────────────────────────────────────────────────────
    gen1, gen2 = (1,2,0,3), (1,3,2,0)
    a4_gens = [gen1, gen2]
    a4_std_raw = {
        sn_id(gen1): [[0,-1,1],[1,-1,1],[0,0,1]],
        sn_id(gen2): [[0,0,-1],[1,0,-1],[1,-1,0]],
    }
    a4_std = orthogonalize_rep(a4_gens, a4_std_raw, "A4 std 3D")
    print_js_genmat("A4 std 3D", a4_std)

    by_ord_a4 = collect_axes(a4_gens, {k: v.tolist() for k, v in a4_std.items()})
    print("\n  A4 std axes by order:")
    for o, axes in sorted(by_ord_a4.items()):
        print(f"    C{o}: {len(axes)} distinct, first = {np.round(axes[0], 8)}")
    presets_a4 = make_presets('A4', by_ord_a4)
    print_presets_js("A4 std", presets_a4)

    # ── A5 4D ─────────────────────────────────────────────────────────────────
    r5, c5 = (1,2,3,4,0), (3,0,2,1,4)
    a5_gens = [r5, c5]
    a5_4d_raw = {
        sn_id(r5): [[-1,-1,-1,-1],[1,0,0,0],[0,1,0,0],[0,0,1,0]],
        sn_id(c5): [[0,1,0,0],[0,0,0,1],[0,0,1,0],[1,0,0,0]],
    }
    a5_4d = orthogonalize_rep(a5_gens, a5_4d_raw, "A5 4D")
    print_js_genmat("A5 4D", a5_4d)

    # ── A5 5D ─────────────────────────────────────────────────────────────────
    a5_5d_raw = {
        sn_id(r5): [[1,0,0,0,0],[0,0,0,1,0],[0,1,0,0,0],[-1,-1,-1,-1,-1],[0,0,1,0,0]],
        sn_id(c5): [[0,1,0,0,0],[0,0,0,1,0],[0,0,0,0,1],[1,0,0,0,0],[-1,-1,-1,-1,-1]],
    }
    a5_5d = orthogonalize_rep(a5_gens, a5_5d_raw, "A5 5D")
    print_js_genmat("A5 5D", a5_5d)

    # ── A5 3D (already orthogonal) — just compute presets ─────────────────────
    sq5 = np.sqrt(5)
    a5_3d_raw = {
        sn_id(r5): [
            [(-1+sq5)/4, -(1+sq5)/4,  0.5],
            [ (1+sq5)/4,  0.5,        (-1+sq5)/4],
            [-0.5,        (-1+sq5)/4,  (1+sq5)/4],
        ],
        sn_id(c5): [[0,0,1],[1,0,0],[0,1,0]],
    }
    by_ord_a5 = collect_axes(a5_gens, a5_3d_raw)
    print(f"\n{'='*60}")
    print("  A5 3D (already orthogonal) — presets only")
    print('='*60)
    print("\n  A5 3D axes by order:")
    for o, axes in sorted(by_ord_a5.items()):
        print(f"    C{o}: {len(axes)} distinct, first = {np.round(axes[0], 8)}")
    presets_a5 = make_presets('A5', by_ord_a5)
    print_presets_js("A5 3D", presets_a5)

    # ── A5 3D' (already orthogonal) — presets ─────────────────────────────────
    a5_3dp_raw = {
        sn_id(r5): [
            [(-1-sq5)/4, -(1-sq5)/4,  0.5],
            [ (1-sq5)/4,  0.5,        (-1-sq5)/4],
            [-0.5,        (-1-sq5)/4,  (1-sq5)/4],
        ],
        sn_id(c5): [[0,0,1],[1,0,0],[0,1,0]],
    }
    by_ord_a5p = collect_axes(a5_gens, a5_3dp_raw)
    print(f"\n{'='*60}")
    print("  A5 3D' (already orthogonal) — presets only")
    print('='*60)
    print("\n  A5 3D' axes by order:")
    for o, axes in sorted(by_ord_a5p.items()):
        print(f"    C{o}: {len(axes)} distinct, first = {np.round(axes[0], 8)}")
    presets_a5p = make_presets('A5', by_ord_a5p)
    print_presets_js("A5 3D'", presets_a5p)

# ─── A5 4D: simplex vertex positions ─────────────────────────────────────────

print()
print('='*60)
print('A5 4D — simplex vertex positions in orthogonalized basis')
print('='*60)

# Recompute P and Pinv for A5 4D
r5, c5 = (1,2,3,4,0), (3,0,2,1,4)
a5_gens = [r5, c5]
a5_4d_raw_dict = {
    sn_id(r5): [[-1,-1,-1,-1],[1,0,0,0],[0,1,0,0],[0,0,1,0]],
    sn_id(c5): [[0,1,0,0],[0,0,0,1],[0,0,1,0],[1,0,0,0]],
}
all_mats_4d = bfs_matrices(a5_gens, a5_4d_raw_dict)
print(f"|A5| from BFS = {len(all_mats_4d)}")
G4d = sum(M.T @ M for M in all_mats_4d.values()) / len(all_mats_4d)
eigenvalues_4d, V_4d = np.linalg.eigh(G4d)
Pinv_4d = np.diag(np.sqrt(eigenvalues_4d)) @ V_4d.T

# The 5 simplex vertices in the raw {fi = ei - e4} basis
simplex_raw = np.array([
    [ 4/5, -1/5, -1/5, -1/5],  # vertex 0
    [-1/5,  4/5, -1/5, -1/5],  # vertex 1
    [-1/5, -1/5,  4/5, -1/5],  # vertex 2
    [-1/5, -1/5, -1/5,  4/5],  # vertex 3
    [-1/5, -1/5, -1/5, -1/5],  # vertex 4
])

simplex_ortho = (Pinv_4d @ simplex_raw.T).T
print('\nSimplex vertex 0 in orthogonalized basis:')
print(' ', np.round(simplex_ortho[0], 10))

# Verify: all pairs have equal distance
dists = [np.linalg.norm(simplex_ortho[i] - simplex_ortho[j]) for i in range(5) for j in range(i+1,5)]
print(f'Edge lengths (should be equal): min={min(dists):.6f}, max={max(dists):.6f}')

# Verify: orbit of vertex 0 under A5 gives all 5 vertices
a5_4d_ortho_dict = {k: v.tolist() for k, v in new_a5_4d.items()}
orbit_v0 = set()
for M in bfs_matrices(a5_gens, a5_4d_ortho_dict).values():
    p = M @ simplex_ortho[0]
    orbit_v0.add(tuple(np.round(p, 5)))
print(f'Orbit size of vertex 0: {len(orbit_v0)} (should be 5)')

print('\nJS: simplex base vector (v0 in orthogonalized 4D basis):')
print('const A5_4D_SIMPLEX_V0 =', '[' + ', '.join(fmt(x) for x in simplex_ortho[0]) + ']')

# ─── A5 5D: intertwiner C (5D rep → traceless symmetric 3×3 matrices) ────────

print()
print('='*60)
print('A5 5D — intertwiner C')
print('='*60)

# 3D orthogonal matrices for A5 (already orthogonal, no change)
sq5 = np.sqrt(5)
a5_3d_gens = {
    sn_id(r5): np.array([
        [(-1+sq5)/4, -(1+sq5)/4,  0.5],
        [ (1+sq5)/4,  0.5,        (-1+sq5)/4],
        [-0.5,        (-1+sq5)/4,  (1+sq5)/4],
    ]),
    sn_id(c5): np.array([[0,0,1],[1,0,0],[0,1,0]], dtype=float),
}

a5_3d_all = bfs_matrices(a5_gens, {k: v.tolist() for k, v in a5_3d_gens.items()})
print(f'A5 3D group order from BFS: {len(a5_3d_all)}')

# ONB for traceless symmetric 3x3 matrices (Frobenius inner product)
B_basis = [
    np.array([[1,0,0],[0,-1,0],[0,0, 0]], dtype=float) / np.sqrt(2),
    np.array([[1,0,0],[0, 1,0],[0,0,-2]], dtype=float) / np.sqrt(6),
    np.array([[0,1,0],[1, 0,0],[0,0, 0]], dtype=float) / np.sqrt(2),
    np.array([[0,0,1],[0, 0,0],[1,0, 0]], dtype=float) / np.sqrt(2),
    np.array([[0,0,0],[0, 0,1],[0,1, 0]], dtype=float) / np.sqrt(2),
]

def l2_rep_matrix(R, basis):
    n = len(basis)
    M = np.zeros((n, n))
    for i, Bi in enumerate(basis):
        RBiRt = R @ Bi @ R.T
        for j, Bj in enumerate(basis):
            M[j, i] = np.sum(Bj * RBiRt)
    return M

# Compute l=2 rep matrices for all A5 elements
a5_sym_all = {eid: l2_rep_matrix(R, B_basis) for eid, R in a5_3d_all.items()}

# Verify: l=2 rep is a valid group homomorphism
rho_sym_r = a5_sym_all[sn_id(r5)]
rho_sym_c = a5_sym_all[sn_id(c5)]

# Check r^5 = I
r5pow5 = np.linalg.matrix_power(rho_sym_r, 5)
print(f'rho_sym(r)^5 = I error: {np.max(np.abs(r5pow5 - np.eye(5))):.2e}')

# 5D orthogonalized matrices
a5_5d_ortho_dict = {k: v.tolist() for k, v in new_a5_5d.items()}
a5_5d_all = bfs_matrices(a5_gens, a5_5d_ortho_dict)
print(f'A5 5D group order from BFS: {len(a5_5d_all)}')

# Find intertwiner C: rho_sym(g) @ C = C @ rho_5d(g) for all g
# C = Σ_g rho_sym(g) @ Phi @ rho_5d(g)^T  (for random Phi)
np.random.seed(42)
Phi = np.random.randn(5, 5)
C = sum(a5_sym_all[eid] @ Phi @ a5_5d_all[eid].T for eid in a5_5d_all) / 60

# Normalize rows of C (or just normalize the whole thing)
C_norm = C / np.linalg.norm(C, 'fro') * np.sqrt(5)
print(f'C shape: {C.shape}')
print(f'C rank: {np.linalg.matrix_rank(C)}')

# Verify: C rho_5d(g) = rho_sym(g) C for all g
max_err_C = max(
    np.max(np.abs(C_norm @ a5_5d_all[eid] - a5_sym_all[eid] @ C_norm))
    for eid in a5_5d_all
)
print(f'Intertwiner verification max error: {max_err_C:.2e}')

# Cinv: map from traceless sym matrix coefficients → 5D vector
# Q = Σ v_i (C_norm^{-1})_ij B_j ... actually:
# C maps 5D vector → sym matrix coefficients
# Q = Σ (C v)_i B_i
# So given v, Q = Σ_i (C v)_i B_i

# Check: for the identity element (v = e_1 = (1,0,0,0,0)), what is Q?
v_test = np.zeros(5); v_test[0] = 1
q_coeffs = C_norm @ v_test
Q_test = sum(q_coeffs[i] * B_basis[i] for i in range(5))
print(f'\nFor v=e1, Q =\n{np.round(Q_test, 6)}')
print(f'tr(Q_test) = {np.trace(Q_test):.6f} (should be 0)')
print(f'||Q_test||_F = {np.linalg.norm(Q_test, "fro"):.6f}')

print('\nJS: intertwiner C matrix (C @ v = Q coefficients in B_basis):')
print('const A5_5D_C = [')
for row in C_norm:
    print(' [' + ', '.join(fmt(x) for x in row) + '],')
print(']')

print('\nJS: B_basis matrices [[row coefficients as [diag, offdiag style]]]:')
print('// B_basis = diag(1,-1,0)/sqrt(2), diag(1,1,-2)/sqrt(6), xy, xz, yz (each /sqrt(2))')
