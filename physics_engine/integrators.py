"""
integrators.py

Time-stepping schemes for advancing a particle system forward by dt,
given an acceleration function accel_fn(positions, masses) -> (N, 3).

All integrators work on raw position/velocity arrays (not the
ParticleSystem object) so each one can be tested and reasoned about
in isolation. `Simulation` (see simulation.py) wires whichever one you
pick up to the rest of the engine.
"""

import numpy as np


def euler_step(positions, velocities, accel, dt, fixed_mask):
    """
    Explicit (forward) Euler - first-order accurate, NOT symplectic.
    Energy will drift (usually grows) over time and orbits spiral
    outward. Useful as a baseline to show why a better integrator
    matters; not recommended for real simulations.
    """
    free = (~fixed_mask)[:, None]
    new_positions = positions + free * velocities * dt
    new_velocities = velocities + free * accel * dt
    return new_positions, new_velocities


def semi_implicit_euler_step(positions, velocities, accel, dt, fixed_mask):
    """
    Semi-implicit (symplectic) Euler: update velocity first, then use
    the *new* velocity to update position. One reordered line versus
    explicit Euler, but qualitatively much better energy behaviour
    over long runs. Good default for quick, cheap simulations.
    """
    free = (~fixed_mask)[:, None]
    new_velocities = velocities + free * accel * dt
    new_positions = positions + free * new_velocities * dt
    return new_positions, new_velocities


def velocity_verlet_step(positions, velocities, accel, dt, fixed_mask, accel_fn, masses):
    """
    Velocity Verlet - the standard integrator for N-body / molecular
    dynamics simulations. Second-order accurate, symplectic (excellent
    long-term energy conservation), and time-reversible.

    Needs the acceleration both before and after the position update,
    so it takes accel_fn directly rather than just a single `accel`
    value. Returns the new acceleration too, so the caller can reuse
    it on the next step instead of recomputing it from scratch.
    """
    free = (~fixed_mask)[:, None]
    new_positions = positions + free * (velocities * dt + 0.5 * accel * dt**2)
    new_accel = accel_fn(new_positions, masses)
    new_velocities = velocities + free * (0.5 * (accel + new_accel) * dt)
    return new_positions, new_velocities, new_accel


def rk4_step(positions, velocities, dt, fixed_mask, accel_fn, masses):
    """
    Classical 4th-order Runge-Kutta on the combined (position,
    velocity) state. Higher per-step accuracy than Verlet, but NOT
    symplectic - energy can still drift very slowly over very long
    integrations. Best when you want high short-term accuracy (e.g.
    checking against an analytic solution) rather than perfect
    long-run conservation.
    """
    free = (~fixed_mask)[:, None]

    def deriv(pos, vel):
        a = accel_fn(pos, masses)
        return free * vel, free * a

    k1v, k1a = deriv(positions, velocities)
    k2v, k2a = deriv(positions + 0.5 * dt * k1v, velocities + 0.5 * dt * k1a)
    k3v, k3a = deriv(positions + 0.5 * dt * k2v, velocities + 0.5 * dt * k2a)
    k4v, k4a = deriv(positions + dt * k3v, velocities + dt * k3a)

    new_positions = positions + (dt / 6.0) * (k1v + 2 * k2v + 2 * k3v + k4v)
    new_velocities = velocities + (dt / 6.0) * (k1a + 2 * k2a + 2 * k3a + k4a)
    return new_positions, new_velocities
