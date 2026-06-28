"""
examples/figure_eight.py

The famous "figure-eight" three-body periodic orbit (Moore, 1993;
proven to exist rigorously by Chenciner & Montgomery, 2000). Three
equal masses chase each other around a figure-eight curve forever (in
the absence of numerical error) - it's a great correctness benchmark:
if the engine reproduces this curve and it closes up periodically,
the N-body force law and integrator are doing the right thing.

Units: G = 1, all masses = 1 (dimensionless "natural units").
"""
import os
import sys
from functools import partial

import matplotlib.pyplot as plt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from physics_engine import ParticleSystem, Simulation, forces

G = 1.0
masses = [1.0, 1.0, 1.0]

# Canonical figure-eight initial conditions (Chenciner & Montgomery, 2000)
x1, y1 = 0.97000436, -0.24308753
vx3, vy3 = -0.93240737, -0.86473146

positions = [
    [x1, y1, 0.0],
    [-x1, -y1, 0.0],
    [0.0, 0.0, 0.0],
]
velocities = [
    [-vx3 / 2, -vy3 / 2, 0.0],
    [-vx3 / 2, -vy3 / 2, 0.0],
    [vx3, vy3, 0.0],
]

system = ParticleSystem(positions, velocities, masses, names=["A", "B", "C"])
accel_fn = partial(forces.newtonian_gravity, G=G, epsilon=0.0)
sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=0.0005)

period = 6.32591398  # known period of the figure-eight orbit, in these units
n_steps = int(period / sim.dt)
sim.run(n_steps, record_every=2)
t, pos, vel = sim.history_arrays()

plt.figure(figsize=(6, 6))
colors = ["tab:red", "tab:blue", "tab:green"]
for i in range(3):
    plt.plot(pos[:, i, 0], pos[:, i, 1], color=colors[i], lw=1.3, label=system.names[i])
plt.gca().set_aspect("equal")
plt.legend()
plt.title("Three-body figure-eight orbit")
out_path = os.path.join(os.path.dirname(__file__), "figure_eight.png")
plt.savefig(out_path, dpi=130)
print(f"Saved {out_path}")
