// physics.js
// JavaScript port of pinkTshirt/physics-engine (Python/NumPy) for live, in-browser
// N-body gravity simulation. Mirrors the original's module boundaries on purpose:
//   forces.newtonian_gravity   -> newtonianGravity()
//   integrators.*              -> EULER, SEMI_IMPLICIT_EULER, VELOCITY_VERLET, RK4
//   diagnostics.*              -> totalEnergy, totalMomentum
//   simulation.Simulation      -> Simulation class
//
// Bodies are stored as flat arrays of {x,y,vx,vy,mass} for performance in a
// real-time animation loop (the Python version uses (N,3) NumPy arrays; we
// work in 2D here since the sandbox is a 2D canvas).

const SOFTENING = 0.08; // softening length, avoids singular force at r->0 on close encounters

/**
 * Newtonian N-body gravity, vectorized over all pairs.
 * Matches forces.newtonian_gravity(positions, masses, G) from the Python engine,
 * including the softening term used in random_cluster.py to tame close encounters.
 */
function newtonianGravity(bodies, G) {
  const n = bodies.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let fx = 0, fy = 0;
    const bi = bodies[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const bj = bodies[j];
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const r = Math.sqrt(r2);
      const invR3 = 1 / (r2 * r);
      fx += G * bj.mass * dx * invR3;
      fy += G * bj.mass * dy * invR3;
    }
    ax[i] = fx;
    ay[i] = fy;
  }
  return { ax, ay };
}

// ---- Integrators ---------------------------------------------------------
// Each mirrors integrators.py: euler, semi_implicit_euler, velocity_verlet, rk4.

function stepEuler(bodies, G, dt) {
  const { ax, ay } = newtonianGravity(bodies, G);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const x0 = b.x, y0 = b.y, vx0 = b.vx, vy0 = b.vy;
    b.x = x0 + vx0 * dt;
    b.y = y0 + vy0 * dt;
    b.vx = vx0 + ax[i] * dt;
    b.vy = vy0 + ay[i] * dt;
  }
}

function stepSemiImplicitEuler(bodies, G, dt) {
  const { ax, ay } = newtonianGravity(bodies, G);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += ax[i] * dt;
    b.vy += ay[i] * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
}

function stepVelocityVerlet(bodies, G, dt, prevAccel) {
  const n = bodies.length;
  if (!prevAccel) {
    prevAccel = newtonianGravity(bodies, G);
  }
  // half-kick position update
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.x += b.vx * dt + 0.5 * prevAccel.ax[i] * dt * dt;
    b.y += b.vy * dt + 0.5 * prevAccel.ay[i] * dt * dt;
  }
  const newAccel = newtonianGravity(bodies, G);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.vx += 0.5 * (prevAccel.ax[i] + newAccel.ax[i]) * dt;
    b.vy += 0.5 * (prevAccel.ay[i] + newAccel.ay[i]) * dt;
  }
  return newAccel; // caller caches this as prevAccel for the next step
}

function stepRK4(bodies, G, dt) {
  const n = bodies.length;
  const state0 = bodies.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }));

  function derivatives(state) {
    const tmp = state.map((s, i) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, mass: bodies[i].mass }));
    const { ax, ay } = newtonianGravity(tmp, G);
    return state.map((s, i) => ({ dx: s.vx, dy: s.vy, dvx: ax[i], dvy: ay[i] }));
  }

  const k1 = derivatives(state0);
  const s1 = state0.map((s, i) => ({
    x: s.x + 0.5 * dt * k1[i].dx, y: s.y + 0.5 * dt * k1[i].dy,
    vx: s.vx + 0.5 * dt * k1[i].dvx, vy: s.vy + 0.5 * dt * k1[i].dvy,
  }));
  const k2 = derivatives(s1);
  const s2 = state0.map((s, i) => ({
    x: s.x + 0.5 * dt * k2[i].dx, y: s.y + 0.5 * dt * k2[i].dy,
    vx: s.vx + 0.5 * dt * k2[i].dvx, vy: s.vy + 0.5 * dt * k2[i].dvy,
  }));
  const k3 = derivatives(s2);
  const s3 = state0.map((s, i) => ({
    x: s.x + dt * k3[i].dx, y: s.y + dt * k3[i].dy,
    vx: s.vx + dt * k3[i].dvx, vy: s.vy + dt * k3[i].dvy,
  }));
  const k4 = derivatives(s3);

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.x = state0[i].x + (dt / 6) * (k1[i].dx + 2 * k2[i].dx + 2 * k3[i].dx + k4[i].dx);
    b.y = state0[i].y + (dt / 6) * (k1[i].dy + 2 * k2[i].dy + 2 * k3[i].dy + k4[i].dy);
    b.vx = state0[i].vx + (dt / 6) * (k1[i].dvx + 2 * k2[i].dvx + 2 * k3[i].dvx + k4[i].dvx);
    b.vy = state0[i].vy + (dt / 6) * (k1[i].dvy + 2 * k2[i].dvy + 2 * k3[i].dvy + k4[i].dvy);
  }
}

const INTEGRATORS = {
  euler: 'euler',
  semi_implicit_euler: 'semi_implicit_euler',
  velocity_verlet: 'velocity_verlet',
  rk4: 'rk4',
};

// ---- Diagnostics ----------------------------------------------------------
// Mirrors diagnostics.py: total_energy, total_momentum, center_of_mass.

function totalKineticEnergy(bodies) {
  let ke = 0;
  for (const b of bodies) {
    ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
  }
  return ke;
}

function totalPotentialEnergy(bodies, G) {
  let pe = 0;
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
      pe -= G * bodies[i].mass * bodies[j].mass / r;
    }
  }
  return pe;
}

function totalEnergy(bodies, G) {
  return totalKineticEnergy(bodies) + totalPotentialEnergy(bodies, G);
}

function totalMomentum(bodies) {
  let px = 0, py = 0;
  for (const b of bodies) {
    px += b.mass * b.vx;
    py += b.mass * b.vy;
  }
  return { px, py, magnitude: Math.sqrt(px * px + py * py) };
}

function centerOfMass(bodies) {
  let mx = 0, my = 0, m = 0;
  for (const b of bodies) {
    mx += b.mass * b.x;
    my += b.mass * b.y;
    m += b.mass;
  }
  return m > 0 ? { x: mx / m, y: my / m } : { x: 0, y: 0 };
}

// ---- Simulation wrapper ----------------------------------------------------
// Mirrors simulation.Simulation: wires bodies + G + integrator together,
// exposes .step(), and tracks an energy history for the live sparkline.

class Simulation {
  constructor(bodies, { G = 1.0, dt = 0.01, integrator = INTEGRATORS.velocity_verlet } = {}) {
    this.bodies = bodies;
    this.G = G;
    this.dt = dt;
    this.integrator = integrator;
    this._prevAccel = null;
    this.initialEnergy = totalEnergy(this.bodies, this.G);
    this.energyHistory = [];
    this.maxHistory = 600;
  }

  setIntegrator(name) {
    this.integrator = name;
    this._prevAccel = null; // verlet cache invalid after switching schemes
    this.initialEnergy = totalEnergy(this.bodies, this.G);
    this.energyHistory = [];
  }

  reset(bodies) {
    this.bodies = bodies;
    this._prevAccel = null;
    this.initialEnergy = totalEnergy(this.bodies, this.G);
    this.energyHistory = [];
  }

  step() {
    switch (this.integrator) {
      case INTEGRATORS.euler:
        stepEuler(this.bodies, this.G, this.dt);
        break;
      case INTEGRATORS.semi_implicit_euler:
        stepSemiImplicitEuler(this.bodies, this.G, this.dt);
        break;
      case INTEGRATORS.rk4:
        stepRK4(this.bodies, this.G, this.dt);
        break;
      case INTEGRATORS.velocity_verlet:
      default:
        this._prevAccel = stepVelocityVerlet(this.bodies, this.G, this.dt, this._prevAccel);
        break;
    }

    const e = totalEnergy(this.bodies, this.G);
    const drift = this.initialEnergy !== 0 ? (e - this.initialEnergy) / Math.abs(this.initialEnergy) : 0;
    this.energyHistory.push(drift);
    if (this.energyHistory.length > this.maxHistory) this.energyHistory.shift();
    return { energy: e, drift, momentum: totalMomentum(this.bodies) };
  }
}

// Export for use in the page script (no bundler — plain script tags + globals).
window.PhysicsEngine = {
  Simulation,
  INTEGRATORS,
  newtonianGravity,
  totalEnergy,
  totalMomentum,
  centerOfMass,
  SOFTENING,
};
