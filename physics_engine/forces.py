"""
forces.py

Acceleration models. Every model is a plain function with signature

    accel_fn(positions, masses) -> (N, 3) array of accelerations

so models can be composed (e.g. N-body gravity + a uniform field) and
swapped independently of the integrator. Functions that take extra
parameters (G, epsilon, ...) should be bound with functools.partial
before being handed to a Simulation - see the examples/ folder.
"""

import numpy as np


def newtonian_gravity(positions, masses, G=6.674e-11, epsilon=0.0):
    """
    Vectorized pairwise Newtonian gravity for all N particles at once.

        a_i = G * sum_{j != i} m_j * (r_j - r_i) / (|r_j - r_i|^2 + eps^2)^1.5

    `epsilon` is a softening length: it keeps the 1/r^2 force finite if
    two particles get arbitrarily close, the standard trick used in
    N-body astrophysics codes (Aarseth, "Gravitational N-Body
    Simulations", 2003). Use epsilon=0.0 for "exact" Newtonian gravity,
    which is fine as long as particles don't actually pass through
    each other (e.g. clean two-body orbits).

    This is O(N^2) but fully vectorized - fine up to a few thousand
    particles. Beyond that you'd want a Barnes-Hut tree or a
    Particle-Mesh method to get back to O(N log N) / O(N).
    """
    diff = positions[np.newaxis, :, :] - positions[:, np.newaxis, :]  # diff[i,j] = pos_j - pos_i
    dist_sq = np.sum(diff * diff, axis=-1) + epsilon**2
    np.fill_diagonal(dist_sq, np.inf)  # remove self-interaction (i == j) cleanly
    inv_dist3 = dist_sq ** -1.5
    weighted = masses[np.newaxis, :, np.newaxis] * inv_dist3[:, :, np.newaxis]
    accel = G * np.sum(weighted * diff, axis=1)
    return accel


def uniform_field(g=(0.0, 0.0, -9.81)):
    """
    Build an accel_fn for a constant gravitational field (e.g. near a
    planet's surface) - independent of mass and position.
    """
    g = np.array(g, dtype=np.float64)

    def accel_fn(positions, masses):
        return np.tile(g, (positions.shape[0], 1))

    return accel_fn


def combine(*accel_fns):
    """Combine several acceleration models into one, e.g.

        combine(partial(newtonian_gravity, G=G), uniform_field((0,0,-9.81)))
    """

    def accel_fn(positions, masses):
        total = np.zeros_like(positions)
        for fn in accel_fns:
            total += fn(positions, masses)
        return total

    return accel_fn
