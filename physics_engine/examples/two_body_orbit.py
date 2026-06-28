"""
examples/two_body_orbit.py

Classic Sun-Earth two-body problem, run with Velocity Verlet and
compared against explicit Euler to show why integrator choice matters
for long simulations.

Units: AU (distance), years (time), solar masses (mass).
In these units G = 4*pi^2 (1 solar mass at 1 AU gives a 1-year orbit).
"""
import os
import sys
from functools import partial

import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from physics_engine import ParticleSystem, Simulation, diagnostics, forces

G = 4 * np.pi**2
M_SUN = 1.0
M_EARTH = 3.003e-6

r = 1.0  # AU
v_rel = np.sqrt(G * (M_SUN + M_EARTH) / r)
v_earth = v_rel * M_SUN / (M_SUN + M_EARTH)
v_sun = -v_rel * M_EARTH / (M_SUN + M_EARTH)

positions = [[0.0, 0.0, 0.0], [r, 0.0, 0.0]]
velocities = [[0.0, v_sun, 0.0], [0.0, v_earth, 0.0]]
masses = [M_SUN, M_EARTH]

accel_fn = partial(forces.newtonian_gravity, G=G, epsilon=0.0)


def run(integrator, n_steps, dt):
    system = ParticleSystem(positions, velocities, masses, names=["Sun", "Earth"])
    sim = Simulation(system, accel_fn, integrator=integrator, dt=dt)
    sim.run(n_steps, record_every=1)
    t, pos, vel = sim.history_arrays()
    energy = np.array(
        [diagnostics.total_energy(pos[k], vel[k], np.array(masses), G=G) for k in range(len(t))]
    )
    return t, pos, vel, energy


dt = 0.001  # years (~8.8 hours)
n_steps = 4000  # ~4 years

t_vv, pos_vv, vel_vv, e_vv = run("velocity_verlet", n_steps, dt)
t_eu, pos_eu, vel_eu, e_eu = run("euler", n_steps, dt)

fig, axes = plt.subplots(1, 2, figsize=(11, 5))

axes[0].plot(pos_vv[:, 0, 0], pos_vv[:, 0, 1], "yo", markersize=10, label="Sun")
axes[0].plot(pos_vv[:, 1, 0], pos_vv[:, 1, 1], lw=1, label="Earth (Verlet)")
axes[0].plot(pos_eu[:, 1, 0], pos_eu[:, 1, 1], lw=1, label="Earth (Euler)")
axes[0].set_xlabel("x (AU)")
axes[0].set_ylabel("y (AU)")
axes[0].set_title("Sun-Earth orbit")
axes[0].legend()
axes[0].set_aspect("equal")

axes[1].plot(t_vv, (e_vv - e_vv[0]) / abs(e_vv[0]) * 100, label="Velocity Verlet")
axes[1].plot(t_eu, (e_eu - e_eu[0]) / abs(e_eu[0]) * 100, label="Euler")
axes[1].set_xlabel("time (years)")
axes[1].set_ylabel("relative energy error (%)")
axes[1].set_title("Energy conservation")
axes[1].legend()

plt.tight_layout()
out_path = os.path.join(os.path.dirname(__file__), "two_body_orbit.png")
plt.savefig(out_path, dpi=130)
print(f"Saved {out_path}")
print(f"Velocity Verlet final relative energy error: {(e_vv[-1]-e_vv[0])/abs(e_vv[0])*100:.6f}%")
print(f"Euler final relative energy error:           {(e_eu[-1]-e_eu[0])/abs(e_eu[0])*100:.6f}%")
