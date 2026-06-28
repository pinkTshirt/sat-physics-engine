"""
diagnostics.py

Physical quantities that *should* stay constant in an isolated system
(no external forces): total energy, momentum, angular momentum, and
the center of mass. Tracking these over a run is the standard way to
sanity-check that an integrator/timestep choice is trustworthy for a
given simulation - if energy drifts by more than a small fraction of
a percent, the timestep is too large or the integrator is unsuitable
for the run length you need.
"""

import numpy as np
from itertools import combinations


def kinetic_energy(velocities, masses):
    speed_sq = np.sum(velocities * velocities, axis=1)
    return float(np.sum(0.5 * masses * speed_sq))


def gravitational_potential_energy(positions, masses, G=6.674e-11, epsilon=0.0):
    n = positions.shape[0]
    pe = 0.0
    for i, j in combinations(range(n), 2):
        r = np.linalg.norm(positions[i] - positions[j])
        pe += -G * masses[i] * masses[j] / np.sqrt(r**2 + epsilon**2)
    return pe


def total_energy(positions, velocities, masses, G=6.674e-11, epsilon=0.0):
    return kinetic_energy(velocities, masses) + gravitational_potential_energy(
        positions, masses, G=G, epsilon=epsilon
    )


def total_momentum(velocities, masses):
    return np.sum(masses[:, None] * velocities, axis=0)


def total_angular_momentum(positions, velocities, masses):
    return np.sum(masses[:, None] * np.cross(positions, velocities), axis=0)


def center_of_mass(positions, masses):
    return np.sum(masses[:, None] * positions, axis=0) / np.sum(masses)
