# physics_engine

A small, vectorized N-body gravity engine in Python, built for research /
scientific simulation rather than for games. It prioritizes:

- **Correctness you can verify** — every example tracks energy, momentum
  conservation, or a known analytic solution, instead of just "looking right."
- **Transparent numerics** — no integrator or force law is a black box;
  each one is a short, readable function with the physics in the docstring.
- **A clean extension point** — adding rigid bodies, collisions, or new
  force laws later doesn't require touching the existing code.

## Architecture

```
physics_engine/
  particles.py     ParticleSystem - positions/velocities/masses as NumPy arrays
  forces.py         acceleration models: Newtonian N-body gravity, uniform field
  integrators.py    Euler, semi-implicit Euler, Velocity Verlet, RK4
  diagnostics.py     energy, momentum, angular momentum, center of mass
  simulation.py      Simulation - wires a system + force model + integrator together
  examples/
    two_body_orbit.py    Sun-Earth orbit; Verlet vs Euler energy drift
    random_cluster.py    20-body cluster; conservation-law sanity check
    figure_eight.py      classic 3-body choreography; correctness benchmark
```

Everything operates on plain `(N, 3)` NumPy arrays rather than a list of
per-particle Python objects, so a force law or integrator is just one
vectorized function call across all N particles — this matters once N
gets past a few dozen.

## Quick start

```bash
pip install numpy matplotlib
python examples/two_body_orbit.py
```

```python
import numpy as np
from functools import partial
from physics_engine import ParticleSystem, Simulation, forces

# Two bodies, arbitrary consistent units
system = ParticleSystem(
    positions=[[0, 0, 0], [1, 0, 0]],
    velocities=[[0, 0, 0], [0, 1, 0]],
    masses=[1.0, 1e-3],
)
accel_fn = partial(forces.newtonian_gravity, G=1.0)
sim = Simulation(system, accel_fn, integrator="velocity_verlet", dt=0.001)
sim.run(n_steps=10000)

t, positions, velocities = sim.history_arrays()  # shape (steps, N, 3)
```

## Units

The engine doesn't impose a unit system — it just requires `G`, masses,
positions, and velocities to all be in one *consistent* system. Two
common choices, both used in the examples:

| System | Distance | Time | Mass | G |
|---|---|---|---|---|
| SI | m | s | kg | 6.674e-11 |
| Astronomical | AU | year | solar mass | 4π² |

The astronomical system is convenient because it avoids the huge/tiny
numbers of SI when simulating planetary or stellar systems.

## Choosing an integrator

This is the most consequential decision in any N-body code, so all four
are implemented and documented rather than picking one for you:

| Integrator | Order | Symplectic? | When to use |
|---|---|---|---|
| `euler` | 1st | No | Never for real runs — included as a baseline to show why it's wrong |
| `semi_implicit_euler` | 1st | Yes | Quick/cheap simulations where rough qualitative behavior is enough |
| `velocity_verlet` | 2nd | Yes | **Default choice** for N-body / orbital mechanics — excellent long-term energy behavior |
| `rk4` | 4th | No | When you need high per-step accuracy (e.g. matching an analytic solution over a short window); energy can still drift slowly over very long runs |

"Symplectic" matters more than raw order for long simulations: a
symplectic integrator's energy error stays *bounded* and oscillates
around the true value forever, while a non-symplectic one's error
*accumulates* monotonically. `examples/two_body_orbit.py` shows this
directly — Velocity Verlet holds energy flat over 4 years, Euler drifts
by 20%.

## Validating the engine

Three examples double as correctness tests:

1. **`two_body_orbit.py`** — Sun-Earth, should trace a closed circle.
   Velocity Verlet's energy error stays ~0%; Euler's grows monotonically.
2. **`figure_eight.py`** — the proven three-body "figure-eight" periodic
   orbit (Chenciner & Montgomery, 2000). If the curve closes up cleanly,
   the force law and integrator are both correct — this is a standard
   benchmark for new N-body codes.
3. **`random_cluster.py`** — a chaotic 20-body system with no analytic
   answer. Here you check energy/momentum conservation instead: total
   momentum should stay ~0 to machine precision (Newton's third law is
   exact in the vectorized force law), and total energy should stay
   bounded to a fraction of a percent if the timestep and softening are
   well chosen.

**A practical note from tuning that last example:** random initial
velocities are very often far too small relative to the depth of the
potential well, so the system free-falls into a violent core collapse
that *no* fixed-timestep integrator can resolve accurately — large
energy errors there usually mean "timestep too big for this close
encounter," not a bug in the force law. The fix used here is to rescale
initial velocities toward rough virial equilibrium (2·KE ≈ |PE|) and use
a non-trivial softening length. For real research use beyond toy
examples, the standard solution is an **adaptive** or **individual**
timestep scheme (shrink dt during close encounters) rather than a single
global fixed dt — a natural next addition to this engine.

## Extending the engine

- **New force law**: write `accel_fn(positions, masses) -> (N,3)` and pass
  it to `Simulation` (optionally combine with `forces.combine(...)`).
- **Collisions / rigid bodies**: this is the natural next layer. Add a
  `shapes.py` (sphere/box geometry + orientation, represented as a
  quaternion or rotation matrix per body), a `collisions.py`
  (broad-phase pruning + narrow-phase contact generation), and an
  impulse- or constraint-based contact resolver that runs after the
  integrator's position update each step.
- **Bigger N**: `forces.newtonian_gravity` is O(N²); past a few thousand
  particles you'd swap in a Barnes-Hut tree or Particle-Mesh method
  behind the same `accel_fn(positions, masses)` interface — nothing else
  in the engine would need to change.
- **Adaptive timestep**: wrap `Simulation.step` to shrink `dt` when the
  closest pairwise distance drops below some threshold, then grow it
  back afterward.
- **Cross-check against SciPy**: for a second opinion on accuracy, the
  same `forces.newtonian_gravity` acceleration function can be wrapped
  as the right-hand side of `scipy.integrate.solve_ivp` (e.g. with
  `method="DOP853"` for an adaptive high-order reference solution) and
  compared against this engine's trajectory.

## References

- Aarseth, S. J. (2003). *Gravitational N-Body Simulations*. Cambridge University Press.
- Chenciner, A. & Montgomery, R. (2000). "A remarkable periodic solution
  of the three-body problem in the case of equal masses." *Annals of
  Mathematics*, 152(3), 881–901.
