"""
particles.py

Defines ParticleSystem: a vectorized container for N point masses.
All physical quantities are stored as NumPy arrays so the rest of the
engine (forces, integrators, diagnostics) can operate on the whole
system at once instead of looping in pure Python.

Units are left unspecified - what matters is that G, positions,
velocities and masses are all expressed in one *consistent* unit
system. See README.md for worked examples in both SI units and
"astronomical units" (AU, solar masses, years).
"""

import numpy as np


class ParticleSystem:
    def __init__(self, positions, velocities, masses, names=None, fixed=None):
        self.positions = np.atleast_2d(np.array(positions, dtype=np.float64))
        self.velocities = np.atleast_2d(np.array(velocities, dtype=np.float64))
        self.masses = np.array(masses, dtype=np.float64).reshape(-1)

        n = self.masses.shape[0]
        if self.positions.shape != (n, 3):
            raise ValueError(f"positions must have shape ({n}, 3), got {self.positions.shape}")
        if self.velocities.shape != (n, 3):
            raise ValueError(f"velocities must have shape ({n}, 3), got {self.velocities.shape}")

        self.n = n
        self.names = list(names) if names is not None else [f"p{i}" for i in range(n)]
        self.fixed = (
            np.array(fixed, dtype=bool) if fixed is not None else np.zeros(n, dtype=bool)
        )

    def copy(self):
        return ParticleSystem(
            self.positions.copy(),
            self.velocities.copy(),
            self.masses.copy(),
            names=list(self.names),
            fixed=self.fixed.copy(),
        )

    def __repr__(self):
        return f"ParticleSystem(n={self.n}, names={self.names})"
