"""
examples/random_cluster.py

N randomly distributed particles interacting only via mutual gravity
(a toy star cluster). This is a genuinely chaotic N-body system with
no analytic solution, so the way to trust the engine here is to check
that energy and total momentum stay (nearly) constant - the standard
sanity check for any new N-body code.
"""
import os
import sys
from functools import partial

import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401  (enables 3D projection)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from physics_engine import ParticleSystem, Simulation, diagnostics, forces

np.random.seed(7)

N = 20
G = 1.0
EPSILON = 0.15  # softening so close encounters don't blow up numerically

positions = np.random.uniform(-1, 1, size=(N, 3))
velocities = np.random.uniform(-1, 1, size=(N, 3))
masses = np.random.uniform(0.5, 1.5, size=N)

# Work in the center-of-mass frame so total momentum starts at exactly zero.
com_v = np.sum(masses[:, None] * velocities, axis=0) / np.sum(masses)
velocities = velocities - com_v

# Rescale velocities so the cluster starts near virial equilibrium
# (2*KE ~ |PE|). Without this, random velocities are typically far too
# small relative to the depth of the potential well: the cluster
# free-falls into a violent core collapse, and no fixed-timestep
# integrator can resolve the resulting close encounters accurately -
# that's a timestep/initial-condition issue, not a bug in the force law.
from physics_engine.diagnostics import gravitational_potential_energy, kinetic_energy

pe0 = gravitational_potential_energy(positions, masses, G=G, epsilon=EPSILON)
ke0 = kinetic_energy(velocities, masses)
target_ke = 0.5 * abs(pe0)
velocities = velocities * np.sqrt(target_ke / ke0)

system = ParticleSystem(positions, velocities, masses)
accel_fn = partial(forces.newtonian_gravity, G=G, epsilon=EPSILON)
sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=0.005)

n_steps = 6000
sim.run(n_steps, record_every=10)
t, pos, vel = sim.history_arrays()

energy = np.array(
    [diagnostics.total_energy(pos[k], vel[k], masses, G=G, epsilon=EPSILON) for k in range(len(t))]
)
momentum = np.array([diagnostics.total_momentum(vel[k], masses) for k in range(len(t))])

fig = plt.figure(figsize=(12, 5))

ax1 = fig.add_subplot(1, 2, 1, projection="3d")
for i in range(N):
    ax1.plot(pos[:, i, 0], pos[:, i, 1], pos[:, i, 2], lw=0.8)
ax1.set_title(f"{N}-body cluster trajectories")

ax2 = fig.add_subplot(1, 2, 2)
ax2.plot(t, (energy - energy[0]) / abs(energy[0]) * 100, label="relative energy error (%)")
ax2.plot(t, np.linalg.norm(momentum, axis=1), label="|total momentum|")
ax2.set_xlabel("time")
ax2.legend()
ax2.set_title("Conservation checks")

plt.tight_layout()
out_path = os.path.join(os.path.dirname(__file__), "random_cluster.png")
plt.savefig(out_path, dpi=130)
print(f"Saved {out_path}")
print(f"Final relative energy error: {(energy[-1]-energy[0])/abs(energy[0])*100:.4f}%")
print(f"Final |total momentum|:      {np.linalg.norm(momentum[-1]):.2e} (started at ~0)")
