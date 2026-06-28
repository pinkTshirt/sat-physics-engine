"""
simulation.py

Simulation: ties a ParticleSystem, an acceleration model, and an
integrator together into one step()/run() API, and records history
for later plotting/analysis.
"""

import numpy as np
from . import integrators


class Simulation:
    def __init__(self, system, accel_fn, integrator="velocity_verlet", dt=0.01):
        """
        system     : a ParticleSystem
        accel_fn   : function(positions, masses) -> (N, 3) accelerations
                     (build with forces.newtonian_gravity / forces.combine, etc.)
        integrator : one of "euler", "semi_implicit_euler", "velocity_verlet", "rk4"
        dt         : fixed timestep
        """
        self.system = system
        self.accel_fn = accel_fn
        self.dt = dt
        self.integrator = integrator
        self.time = 0.0
        self._accel = self.accel_fn(self.system.positions, self.system.masses)

        self.history = {"t": [], "positions": [], "velocities": []}

    def step(self):
        s = self.system

        if self.integrator == "euler":
            s.positions, s.velocities = integrators.euler_step(
                s.positions, s.velocities, self._accel, self.dt, s.fixed
            )
            self._accel = self.accel_fn(s.positions, s.masses)

        elif self.integrator == "semi_implicit_euler":
            s.positions, s.velocities = integrators.semi_implicit_euler_step(
                s.positions, s.velocities, self._accel, self.dt, s.fixed
            )
            self._accel = self.accel_fn(s.positions, s.masses)

        elif self.integrator == "velocity_verlet":
            s.positions, s.velocities, self._accel = integrators.velocity_verlet_step(
                s.positions, s.velocities, self._accel, self.dt, s.fixed, self.accel_fn, s.masses
            )

        elif self.integrator == "rk4":
            s.positions, s.velocities = integrators.rk4_step(
                s.positions, s.velocities, self.dt, s.fixed, self.accel_fn, s.masses
            )
            self._accel = self.accel_fn(s.positions, s.masses)

        else:
            raise ValueError(f"Unknown integrator: {self.integrator!r}")

        self.time += self.dt

    def run(self, n_steps, record_every=1):
        for i in range(n_steps):
            self.step()
            if i % record_every == 0:
                self.history["t"].append(self.time)
                self.history["positions"].append(self.system.positions.copy())
                self.history["velocities"].append(self.system.velocities.copy())

    def history_arrays(self):
        """Recorded history as plain NumPy arrays, ready for plotting/analysis."""
        return (
            np.array(self.history["t"]),
            np.array(self.history["positions"]),  # shape (steps, N, 3)
            np.array(self.history["velocities"]),  # shape (steps, N, 3)
        )
