/* Diagonalizes the Laplacian of D_L^(b) off the main thread. */
import { buildLattice, laplacian, jacobiEigen, groupLevels, sparsify } from "./lattice.js?v=20261029a";

self.onmessage = e => {
    const { b, L } = e.data;
    const g = buildLattice(b, L);
    const { values, vectors } = jacobiEigen(laplacian(g), g.n);
    // show degenerate notes through their most local eigenvectors
    for (const { indices } of groupLevels(values)) {
        if (indices.length < 2) continue;
        sparsify(indices.map(i => vectors[i])).forEach((v, j) => { vectors[indices[j]] = v; });
    }
    self.postMessage({ b, L, values, vectors }, vectors.map(v => v.buffer));
};
