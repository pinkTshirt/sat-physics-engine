# tests/test_conservation.py
#
# Regression tests for the conservation laws this engine is built to satisfy
# (see README: "Validating the engine"). These exercise the public API
# exactly as documented in the README's Quick start section:
#
#   from physics_engine import ParticleSystem, Simulation, forces
#   accel_fn = partial(forces.newtonian_gravity, G=...)
#   sim = Simulation(system, accel_fn, integrator="...", dt=...)
#   sim.run(n_steps=...)
#   t, positions, velocities = sim.history_arrays()
#
# If physics_engine's actual constructor signature differs slightly from
# this (e.g. masses passed separately, or run() returning history directly),
# update the two helper functions below — the assertions themselves don't
# need to change.

from functools import partial

import numpy as np
import pytest

from physics_engine import ParticleSystem, Simulation, forces


def _masses_from_system(system, fallback_masses):
    """Best-effort extraction of per-body masses for energy/momentum calcs.

    Different reasonable designs exist (system.masses, system.mass, etc.);
    try the documented attribute first and fall back to what we passed in.
    """
    for attr in ("masses", "mass"):
        if hasattr(system, attr):
            return np.asarray(getattr(system, attr), dtype=float)
    return np.asarray(fallback_masses, dtype=float)


def _kinetic_energy(masses, velocities):
    # velocities: (N, 3) at a single timestep
    return float(0.5 * np.sum(masses * np.sum(velocities ** 2, axis=1)))


def _potential_energy(masses, positions, G, softening=0.0):
    # positions: (N, 3) at a single timestep
    n = len(masses)
    pe = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            r = np.linalg.norm(positions[j] - positions[i])
            r = np.sqrt(r ** 2 + softening ** 2)
            pe -= G * masses[i] * masses[j] / r
    return pe


def _total_momentum(masses, velocities):
    return masses @ velocities  # (3,) vector


@pytest.fixture
def two_body_system():
    """Sun-like heavy body + light orbiter, matching the README's quick-start values."""
    positions = [[0, 0, 0], [1, 0, 0]]
    velocities = [[0, 0, 0], [0, 1, 0]]
    masses = [1.0, 1e-3]
    system = ParticleSystem(positions=positions, velocities=velocities, masses=masses)
    return system, masses


def test_velocity_verlet_conserves_energy(two_body_system):
    """Velocity Verlet should hold total energy ~flat over many steps.

    This is the central claim of the README ('Velocity Verlet holds energy
    flat over 4 years'). We check relative drift stays within a small
    tolerance rather than expecting it to be exactly zero, since floating
    point and softening introduce some noise.
    """
    system, masses = two_body_system
    G = 1.0
    accel_fn = partial(forces.newtonian_gravity, G=G)
    sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=0.001)
    sim.run(n_steps=10000)

    t, positions, velocities = sim.history_arrays()
    masses_arr = _masses_from_system(system, masses)

    e0 = _kinetic_energy(masses_arr, velocities[0]) + _potential_energy(masses_arr, positions[0], G)
    ef = _kinetic_energy(masses_arr, velocities[-1]) + _potential_energy(masses_arr, positions[-1], G)

    relative_drift = abs(ef - e0) / abs(e0)
    assert relative_drift < 0.01, (
        f"Velocity Verlet energy drift too large: {relative_drift:.2%} "
        f"(expected near-flat conservation per README)"
    )


def test_euler_drifts_more_than_verlet(two_body_system):
    """Sanity check on the README's qualitative claim: Euler's energy error
    grows monotonically and ends up much worse than Verlet's over the same
    run, even though both start from identical initial conditions.
    """
    system, masses = two_body_system
    G = 1.0
    accel_fn = partial(forces.newtonian_gravity, G=G)

    def final_drift(integrator):
        sys_copy = ParticleSystem(
            positions=[[0, 0, 0], [1, 0, 0]],
            velocities=[[0, 0, 0], [0, 1, 0]],
            masses=masses,
        )
        sim = Simulation(sys_copy, accel_fn, integrator=integrator, dt=0.001)
        sim.run(n_steps=10000)
        t, positions, velocities = sim.history_arrays()
        masses_arr = _masses_from_system(sys_copy, masses)
        e0 = _kinetic_energy(masses_arr, velocities[0]) + _potential_energy(masses_arr, positions[0], G)
        ef = _kinetic_energy(masses_arr, velocities[-1]) + _potential_energy(masses_arr, positions[-1], G)
        return abs(ef - e0) / abs(e0)

    euler_drift = final_drift("euler")
    verlet_drift = final_drift("velocity_verlet")

    assert euler_drift > verlet_drift, (
        "Expected Euler to drift more than Velocity Verlet over an identical run "
        f"(euler={euler_drift:.2%}, verlet={verlet_drift:.2%})"
    )


def test_momentum_conserved_in_isolated_system():
    """Total momentum of an isolated N-body system should stay ~0 to
    machine precision (Newton's third law is exact in the vectorized
    force law) -- this is the random_cluster.py sanity check in the README.
    """
    rng = np.random.default_rng(seed=42)
    n = 8
    positions = rng.uniform(-2, 2, size=(n, 3)).tolist()
    velocities = rng.uniform(-0.3, 0.3, size=(n, 3)).tolist()
    masses = rng.uniform(0.5, 2.0, size=n).tolist()

    system = ParticleSystem(positions=positions, velocities=velocities, masses=masses)
    accel_fn = partial(forces.newtonian_gravity, G=1.0)
    sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=0.001)
    sim.run(n_steps=2000)

    t, positions_hist, velocities_hist = sim.history_arrays()
    masses_arr = _masses_from_system(system, masses)

    p0 = _total_momentum(masses_arr, velocities_hist[0])
    pf = _total_momentum(masses_arr, velocities_hist[-1])

    # Compare drift in momentum magnitude against the system's overall scale
    # (total mass * a representative velocity) rather than an absolute
    # constant, so the test isn't sensitive to the specific random draw.
    scale = float(np.sum(masses_arr)) * 1.0
    assert np.linalg.norm(pf - p0) / scale < 1e-6, (
        "Total momentum should stay constant to near machine precision "
        "in an isolated system (no external forces)."
    )


def test_figure_eight_closes_up():
    """The proven three-body 'figure-eight' periodic orbit (Chenciner &
    Montgomery, 2000) should return close to its starting configuration
    after one period under Velocity Verlet -- this is the standard
    correctness benchmark described in the README.
    """
    period = 6.32591398
    dt = 0.0001
    n_steps = round(period / dt)

    positions = [
        [0.97000436, -0.24308753, 0.0],
        [-0.97000436, 0.24308753, 0.0],
        [0.0, 0.0, 0.0],
    ]
    velocities = [
        [0.466203685, 0.43236573, 0.0],
        [0.466203685, 0.43236573, 0.0],
        [-0.93240737, -0.86473146, 0.0],
    ]
    masses = [1.0, 1.0, 1.0]

    system = ParticleSystem(positions=positions, velocities=velocities, masses=masses)
    accel_fn = partial(forces.newtonian_gravity, G=1.0)
    sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=dt)
    sim.run(n_steps=n_steps)

    t, positions_hist, velocities_hist = sim.history_arrays()

    start = np.asarray(positions)
    end = positions_hist[-1]
    max_error = float(np.max(np.linalg.norm(end - start, axis=1)))

    # Loose tolerance: softening / integration error means this won't be
    # exact, but it should clearly close up rather than fly apart.
    assert max_error < 0.5, (
        f"Figure-eight orbit did not close up after one period "
        f"(max position error = {max_error:.4f})"
    )
