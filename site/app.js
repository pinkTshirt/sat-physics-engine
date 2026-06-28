// app.js
// Wires the PhysicsEngine (physics.js) to the canvas UI: rendering, interaction,
// presets, live diagnostics. No frameworks — plain canvas 2D + DOM.

(function () {
  const { Simulation, INTEGRATORS, totalMomentum, centerOfMass } = window.PhysicsEngine;

  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  const energyCanvas = document.getElementById('energy-canvas');
  const energyCtx = energyCanvas.getContext('2d');

  const BODY_COLORS = ['#ffb000', '#4fd8e8', '#ff5fa0', '#3ddc84', '#b18cff', '#ff8c42', '#5f9eff', '#ffe14f'];
  let colorIdx = 0;
  function nextColor() {
    const c = BODY_COLORS[colorIdx % BODY_COLORS.length];
    colorIdx++;
    return c;
  }

  // World <-> screen mapping: world units are "AU-like", scaled to fit canvas.
  let scale = 90; // pixels per world unit
  let originX = 0, originY = 0; // recalculated on resize

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    originX = rect.width / 2;
    originY = rect.height / 2;
  }
  window.addEventListener('resize', resize);

  function worldToScreen(x, y) {
    return { sx: originX + x * scale, sy: originY - y * scale };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - originX) / scale, y: -(sy - originY) / scale };
  }

  // ---- Body factory ----------------------------------------------------
  function makeBody(x, y, vx, vy, mass, color, fixed = false) {
    return { x, y, vx, vy, mass, color: color || nextColor(), trail: [], fixed: !!fixed };
  }

  // ---- Presets (mirrors the repo's examples/*.py) -----------------------
  function presetTwoBody() {
    colorIdx = 0;
    return [
      makeBody(0, 0, 0, 0, 25, nextColor()),
      makeBody(2.2, 0, 0, 2.1, 0.3, nextColor()),
    ];
  }

  function presetFigureEight() {
    colorIdx = 0;
    // Exact Chenciner-Montgomery figure-eight initial conditions (G=1, equal
    // unit masses, period ~6.32591398). Positions/velocities/masses must
    // match the literature values together -- this is a delicate periodic
    // solution, not an arbitrary configuration, so nothing here should be
    // rescaled independently. If it looks too small/large on screen, zoom
    // the camera (see `scale`) instead of touching these numbers.
    return [
      makeBody(0.97000436, -0.24308753, 0.466203685, 0.43236573, 1, nextColor()),
      makeBody(-0.97000436, 0.24308753, 0.466203685, 0.43236573, 1, nextColor()),
      makeBody(0, 0, -0.93240737, -0.86473146, 1, nextColor()),
    ];
  }

  function presetCluster() {
    colorIdx = 0;
    const n = 12;
    const bodies = [];
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 2.2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      // rough tangential velocity toward virial-ish equilibrium, plus noise
      const speed = 0.55 / Math.sqrt(r) + (Math.random() - 0.5) * 0.15;
      const vx = -Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed;
      bodies.push(makeBody(x, y, vx, vy, 0.6 + Math.random() * 1.2, nextColor()));
    }
    return bodies;
  }

  function presetBinaryChaos() {
    colorIdx = 0;
    return [
      makeBody(-0.6, 0, 0, -1.3, 6, nextColor()),
      makeBody(0.6, 0, 0, 1.3, 6, nextColor()),
      makeBody(3.5, 2.0, -1.1, -0.4, 1.2, nextColor()),
    ];
  }

  const PRESETS = {
    'two-body': presetTwoBody,
    'figure-eight': presetFigureEight,
    'cluster': presetCluster,
    'binary-chaos': presetBinaryChaos,
  };

  // ---- Simulation instance ------------------------------------------------
  let sim = new Simulation(presetTwoBody(), { G: 1.0, dt: 0.01, integrator: INTEGRATORS.velocity_verlet });
  let running = true;
  let trailMax = 120;

  // ---- Interaction: drag to launch a body --------------------------------
  let dragStart = null; // {x,y} world coords
  let dragCurrent = null;

  function canvasPointFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    const sy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return screenToWorld(sx, sy);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const w = canvasPointFromEvent(e);
    dragStart = w;
    dragCurrent = w;
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    dragCurrent = canvasPointFromEvent(e);
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragStart) return;
    const end = canvasPointFromEvent(e);
    const fixed = e.shiftKey;
    const vx = fixed ? 0 : (end.x - dragStart.x) * 1.4;
    const vy = fixed ? 0 : (end.y - dragStart.y) * 1.4;
    const mass = fixed ? 8 : 1.0;
    sim.bodies.push(makeBody(dragStart.x, dragStart.y, vx, vy, mass, null, fixed));
    sim.reset(sim.bodies);
    dragStart = null;
    dragCurrent = null;
    refreshBodyList();
  });

  // ---- Rendering -----------------------------------------------------------
  function drawGrid() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.strokeStyle = '#13151c';
    ctx.lineWidth = 1;
    const step = scale; // 1 world unit grid
    ctx.beginPath();
    for (let x = originX % step; x < w; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = originY % step; y < h; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // origin crosshair, faint
    ctx.strokeStyle = '#1d212b';
    ctx.beginPath();
    ctx.moveTo(originX, 0); ctx.lineTo(originX, h);
    ctx.moveTo(0, originY); ctx.lineTo(w, originY);
    ctx.stroke();
  }

  function radiusForMass(mass) {
    return 3 + Math.cbrt(mass) * 3.2;
  }

  function drawBodies() {
    for (const b of sim.bodies) {
      const { sx, sy } = worldToScreen(b.x, b.y);

      // trail
      if (b.trail.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i++) {
          const p = worldToScreen(b.trail[i].x, b.trail[i].y);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // body
      const r = radiusForMass(b.mass);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();

      if (b.fixed) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // glow
      ctx.beginPath();
      ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2);
      grad.addColorStop(0, b.color + '55');
      grad.addColorStop(1, b.color + '00');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  function drawDragVector() {
    if (!dragStart || !dragCurrent) return;
    const p0 = worldToScreen(dragStart.x, dragStart.y);
    const p1 = worldToScreen(dragCurrent.x, dragCurrent.y);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.strokeStyle = '#ffb000';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(p0.sx, p0.sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb000';
    ctx.fill();
  }

  function drawEnergyScope() {
    const w = energyCanvas.width / devicePixelRatio;
    const h = energyCanvas.height / devicePixelRatio;
    energyCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    energyCtx.clearRect(0, 0, w, h);

    // zero line
    energyCtx.strokeStyle = '#2a2e38';
    energyCtx.lineWidth = 1;
    energyCtx.beginPath();
    energyCtx.moveTo(0, h / 2);
    energyCtx.lineTo(w, h / 2);
    energyCtx.stroke();

    const hist = sim.energyHistory;
    if (hist.length < 2) return;

    // scale: clamp drift display to +/- 5% band, anything beyond clips to edges
    const band = 0.05;
    energyCtx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const x = (i / (sim.maxHistory - 1)) * w;
      const clamped = Math.max(-band, Math.min(band, hist[i]));
      const y = h / 2 - (clamped / band) * (h / 2 - 3);
      if (i === 0) energyCtx.moveTo(x, y);
      else energyCtx.lineTo(x, y);
    }
    const driftNow = hist[hist.length - 1];
    energyCtx.strokeStyle = Math.abs(driftNow) > 0.02 ? '#ff4d4d' : '#ffb000';
    energyCtx.lineWidth = 1.4;
    energyCtx.stroke();
  }

  // ---- HUD text updates -----------------------------------------------------
  const driftReadout = document.getElementById('drift-readout');
  const integratorReadout = document.getElementById('integrator-readout');
  const stepReadout = document.getElementById('step-readout');
  const momentumReadout = document.getElementById('momentum-readout');
  const bodyCountReadout = document.getElementById('body-count');

  let stepCount = 0;

  function updateHud(diag) {
    const driftPct = diag.drift * 100;
    driftReadout.textContent = (driftPct >= 0 ? '+' : '') + driftPct.toFixed(3) + '%';
    driftReadout.classList.remove('good', 'bad');
    if (Math.abs(driftPct) > 2) driftReadout.classList.add('bad');
    else if (Math.abs(driftPct) < 0.05) driftReadout.classList.add('good');

    integratorReadout.textContent = sim.integrator;
    stepReadout.textContent = 'step ' + stepCount;
    momentumReadout.textContent = diag.momentum.magnitude.toExponential(2);
    bodyCountReadout.textContent = sim.bodies.length;
  }

  // ---- Body inspector list ----------------------------------------------
  const bodyListEl = document.getElementById('body-list');
  const emptyBodiesEl = document.getElementById('empty-bodies');

  function refreshBodyList() {
    bodyListEl.innerHTML = '';
    if (sim.bodies.length === 0) {
      emptyBodiesEl.style.display = 'block';
      return;
    }
    emptyBodiesEl.style.display = 'none';
    sim.bodies.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'body-row';
      row.innerHTML = `
        <span class="swatch" style="background:${b.color}"></span>
        <span>${b.fixed ? 'anchor' : 'body'} ${i + 1}</span>
        <span class="mass-val">${b.mass.toFixed(2)}</span>
        <button class="del-btn" data-idx="${i}" aria-label="remove body">&times;</button>
      `;
      bodyListEl.appendChild(row);
    });
    bodyListEl.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        sim.bodies.splice(idx, 1);
        sim.reset(sim.bodies);
        refreshBodyList();
      });
    });
  }

  // ---- Main loop -----------------------------------------------------------
  let instabilityWarned = false;

  function frame() {
    if (running) {
      const diag = sim.step();
      stepCount++;

      // Defensive guard: tight/chaotic configurations (close binaries, dense
      // clusters) can become numerically unstable at a given dt even though
      // the same preset is fine at a smaller one -- this is an inherent
      // property of fixed-timestep integrators near close encounters, not a
      // bug in the force law (see README's note on random_cluster.py). Catch
      // it and self-correct rather than let bodies rocket off-screen.
      const maxDist = sim.bodies.reduce((m, b) => Math.max(m, Math.abs(b.x), Math.abs(b.y)), 0);
      const unstable = !Number.isFinite(maxDist) || maxDist > 50;
      if (unstable && sim.dt > 0.0005) {
        sim.dt = Math.max(0.0005, sim.dt / 4);
        dtSlider.value = sim.dt;
        dtVal.textContent = sim.dt.toFixed(4);
        if (!instabilityWarned) {
          instabilityWarned = true;
          setTimeout(() => { instabilityWarned = false; }, 4000);
        }
      }

      // trail bookkeeping
      for (const b of sim.bodies) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > trailMax) b.trail.shift();
      }

      updateHud(diag);
      if (stepCount % 3 === 0) drawEnergyScope();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawBodies();
    drawDragVector();

    requestAnimationFrame(frame);
  }

  // ---- Controls wiring -------------------------------------------------
  document.querySelectorAll('.integ-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.integ-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sim.setIntegrator(btn.dataset.integ);
      stepCount = 0;
    });
  });

  const gSlider = document.getElementById('g-slider');
  const gVal = document.getElementById('g-val');
  gSlider.addEventListener('input', () => {
    sim.G = parseFloat(gSlider.value);
    gVal.textContent = sim.G.toFixed(2);
    sim.initialEnergy = window.PhysicsEngine.totalEnergy(sim.bodies, sim.G);
    sim.energyHistory = [];
  });

  const dtSlider = document.getElementById('dt-slider');
  const dtVal = document.getElementById('dt-val');
  dtSlider.addEventListener('input', () => {
    sim.dt = parseFloat(dtSlider.value);
    dtVal.textContent = sim.dt.toFixed(3);
  });

  const trailSlider = document.getElementById('trail-slider');
  const trailVal = document.getElementById('trail-val');
  trailSlider.addEventListener('input', () => {
    trailMax = parseInt(trailSlider.value, 10);
    trailVal.textContent = trailMax;
  });

  // Per-preset camera zoom AND a safe default dt: presets have very
  // different orbital timescales (the tight binary in binary-chaos needs a
  // much smaller dt to stay numerically stable than the gentle two-body
  // orbit does), so each preset resets dt/G to values known to be stable
  // for it rather than inheriting whatever the sliders were last left at.
  const PRESET_SCALE = {
    'two-body': 90,
    'figure-eight': 160,
    'cluster': 70,
    'binary-chaos': 80,
  };

  const PRESET_DT = {
    'two-body': 0.01,
    'figure-eight': 0.001,
    'cluster': 0.005,
    'binary-chaos': 0.002,
  };

  function applyPreset(name) {
    const presetFn = PRESETS[name];
    if (!presetFn) return;
    sim.reset(presetFn());
    sim.G = 1.0;
    sim.dt = PRESET_DT[name] || 0.01;
    scale = PRESET_SCALE[name] || 90;
    stepCount = 0;

    // keep the sliders in sync with the values we just applied, so the UI
    // doesn't silently disagree with what the simulation is actually using
    gSlider.value = sim.G;
    gVal.textContent = sim.G.toFixed(2);
    dtSlider.value = sim.dt;
    dtVal.textContent = sim.dt.toFixed(3);

    refreshBodyList();
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  const playPauseBtn = document.getElementById('play-pause-btn');
  playPauseBtn.addEventListener('click', () => {
    running = !running;
    playPauseBtn.textContent = running ? '⏸ pause' : '▶ play';
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    sim.reset([]);
    stepCount = 0;
    refreshBodyList();
  });

  // ---- Boot -----------------------------------------------------------------
  resize();
  refreshBodyList();
  requestAnimationFrame(frame);
})();
