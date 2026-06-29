// learn.js
// Data + rendering engine for the "Learn the Physics" page.
//
// Two independent trees:
//   - LIVE: the physics that actually runs in this site's sandbox (site/physics.js)
//   - SAT:  the Separating Axis Theorem collision engine documented in the repo's
//           README — NOT wired into the live JS sandbox on this page, included
//           here purely as reference material for the engine's namesake physics.
//
// Each tree is: { id, label, summary, body, color, children: [branch, ...] }
// Branches are: { id, label, summary, body, color, children: [leaf, ...] }
// Leaves are:   { id, label, body }
//
// `body` strings use $...$ / $$...$$ for MathJax and \n\n for paragraph breaks.
// String.raw is used everywhere so LaTeX backslashes don't need JS-escaping.

(function () {

  const LIVE_TREE = {
    id: 'live-root',
    label: 'N-Body\nGravity\nSandbox',
    summary: 'What actually runs when you drag a body onto the canvas.',
    body: String.raw`Every body you drop onto the canvas — and everything loaded by a preset —
obeys exactly one law: Newtonian gravity, integrated forward in time by whichever
scheme is selected in the side panel. There is no collision physics, no friction,
no walls here — bodies pass straight through each other and only ever interact
through gravity.

Five things make up the whole system: the force law, the time-integration
scheme, the conservation diagnostics that police it, the numerical knobs that
keep it stable, and the five preset initial conditions you can load from the
side panel. Pick a branch to dig into any of them.`,
    children: [
      {
        id: 'gravity',
        label: 'Newtonian\nGravity',
        color: '#ffb000',
        summary: 'The one force in this universe.',
        body: String.raw`Gravity is the *only* interaction in this sandbox. There's no normal force,
no collision response, no drag — just every body pulling on every other body,
all the time.`,
        children: [
          {
            id: 'force-law',
            label: 'Force Law',
            body: String.raw`Every body pulls on every other body with the inverse-square law:

$$\vec a_i = G\sum_{j\neq i} m_j\,\frac{\vec r_j - \vec r_i}{\lVert \vec r_j-\vec r_i\rVert^3}$$

Double the distance between two bodies and the pull drops by 4×. There's no
cutoff radius — even a far-away body contributes a (tiny) tug, which is why a
passing third body in *Binary + interloper* can perturb a tight binary from
clear across the screen.`
          },
          {
            id: 'pairwise',
            label: 'Pairwise\nSummation',
            body: String.raw`To get *one* body's acceleration, the engine sums the contribution of every
other body — for $N$ bodies that's $O(N^2)$ pair evaluations per frame.

The 12-body *Random cluster* preset does $12\times11=132$ pair checks every
single animation frame, 60 times a second. This is exactly why real
astrophysics codes use Barnes–Hut trees or particle-mesh methods instead —
this engine's $O(N^2)$ sum is *exact*, but it would get slow well before you
reached a few thousand bodies.`
          },
          {
            id: 'softening',
            label: 'Softening\nLength ε',
            body: String.raw`If two bodies get arbitrarily close, $1/r^2$ blows up toward infinity and
the simulation explodes. The engine adds a small softening constant
$\epsilon$ to the squared distance before dividing:

$$r^2 \;\to\; r^2 + \epsilon^2$$

In this sandbox $\epsilon = 0.08$ world units — small enough to barely affect
ordinary orbits, large enough that two bodies grazing past each other get a
strong-but-finite kick instead of a divide-by-zero spike.`
          }
        ]
      },
      {
        id: 'integration',
        label: 'Time\nIntegration',
        color: '#4fd8e8',
        summary: 'How position and velocity step forward each frame.',
        body: String.raw`The force law tells you the *acceleration* right now. Turning that into a
new position and velocity, frame by frame, is the integrator's job — and the
four schemes below give surprisingly different answers from the same physics.`,
        children: [
          {
            id: 'euler',
            label: 'Euler',
            body: String.raw`The simplest possible scheme: use the *old* velocity to move position, and
the *old* acceleration to update velocity, both from the same instant:

$$\vec x_{new} = \vec x + \vec v\,\Delta t \qquad\qquad \vec v_{new} = \vec v + \vec a\,\Delta t$$

It's only first-order accurate and **not symplectic**, so energy drifts —
usually upward. Switch to Euler mid-orbit and watch the energy scope visibly
bow away from zero. It's included mainly as the "why we don't use this"
baseline.`
          },
          {
            id: 'semi-implicit-euler',
            label: 'Semi-implicit\nEuler',
            body: String.raw`One line reordered from explicit Euler — update velocity *first*, then use
the **new** velocity to move position:

$$\vec v_{new} = \vec v + \vec a\,\Delta t \qquad\qquad \vec x_{new} = \vec x + \vec v_{new}\,\Delta t$$

That single reordering makes it *symplectic*: energy oscillates around the
true value instead of drifting away. Still only first-order accurate, but a
good, cheap default when you don't need Verlet's extra accuracy.`
          },
          {
            id: 'velocity-verlet',
            label: 'Velocity\nVerlet',
            body: String.raw`The engine's default. Second-order accurate **and** symplectic — the gold
standard for orbital mechanics and molecular dynamics alike:

$$\vec x_{new} = \vec x + \vec v\,\Delta t + \tfrac12\vec a\,\Delta t^2$$
$$\vec v_{new} = \vec v + \tfrac12(\vec a + \vec a_{new})\,\Delta t$$

It needs the acceleration *before and after* the position update — which is
why the code caches \`prevAccel\` between frames instead of recomputing
gravity twice per step. This is what keeps the figure-eight orbit closing on
itself after thousands of periods instead of slowly spiraling apart.`
          },
          {
            id: 'rk4',
            label: 'RK4',
            body: String.raw`Classical 4th-order Runge–Kutta: it samples the acceleration at four points
across the timestep ($k_1 \dots k_4$) and blends them:

$$\vec x_{new} = \vec x + \frac{\Delta t}{6}\big(k_1 + 2k_2 + 2k_3 + k_4\big)$$

Higher *short-term* accuracy than Verlet, but **not symplectic** — over very
long runs energy can still creep, just far more slowly than plain Euler.
Good when you care about nailing one orbit precisely rather than perfect
conservation over thousands of periods.`
          }
        ]
      },
      {
        id: 'diagnostics',
        label: 'Conservation\nDiagnostics',
        color: '#ff5fa0',
        summary: 'The numbers that prove (or disprove) the physics is correct.',
        body: String.raw`An isolated gravitational system has no business losing or gaining energy
or momentum. The HUD on the simulation page is built entirely around catching
it if it does.`,
        children: [
          {
            id: 'kinetic-energy',
            label: 'Kinetic\nEnergy',
            body: String.raw`$$KE = \sum_i \tfrac12 m_i v_i^2$$

The sum of every body's "$\tfrac12 mv^2$". It rises near close encounters
(bodies speed up as they fall toward each other) and falls again as they
climb back apart.`
          },
          {
            id: 'potential-energy',
            label: 'Potential\nEnergy',
            body: String.raw`$$PE = -\sum_{i<j} \frac{G\,m_i m_j}{r_{ij}}$$

Always negative for a bound system — gravity is attractive, so it takes
*positive* work to separate two bodies out to infinity. Together,
$KE + PE$ should stay nearly constant for an isolated system.`
          },
          {
            id: 'total-energy-drift',
            label: 'Total Energy\n& Drift',
            body: String.raw`The engine tracks $E = KE + PE$ at every step and compares it to the value
at $t=0$:

$$\text{drift} = \frac{E(t) - E(0)}{\lvert E(0) \rvert}$$

That's exactly the percentage shown in the top-right energy scope. It's the
single best "is this integrator actually behaving" readout in the whole UI —
flip to Euler mid-run and watch it climb.`
          },
          {
            id: 'momentum',
            label: 'Linear\nMomentum',
            body: String.raw`$$\vec p = \sum_i m_i \vec v_i$$

Gravity is an internal force — every pull on body A has an equal-and-opposite
pull from A on the other body — so a closed system's total momentum should
never change. The bottom-left $\lVert \vec p \rVert$ readout staying flat is a
second, independent sanity check, separate from the energy scope and just as
revealing if something's wrong.`
          },
          {
            id: 'center-of-mass',
            label: 'Center of\nMass',
            body: String.raw`$$\vec x_{cm} = \frac{\sum_i m_i \vec x_i}{\sum_i m_i}$$

The mass-weighted average position. For an isolated system, this point should
drift at constant velocity — or sit still, as it does in every preset here —
no matter how wildly the individual bodies orbit around it. It's the "eye of
the storm" in a chaotic configuration like the random cluster.`
          }
        ]
      },
      {
        id: 'stability',
        label: 'Numerical\nStability',
        color: '#3ddc84',
        summary: 'Why the same physics can look "wrong" at the wrong settings.',
        body: String.raw`Same gravity law, same integrators — but the *settings* you pick determine
whether a simulation looks smoothly physical or visibly breaks down.`,
        children: [
          {
            id: 'timestep',
            label: 'Timestep\nΔt',
            body: String.raw`$\Delta t$ is how far the simulation jumps forward in *world* time per
frame — not real time. A larger $\Delta t$ runs the visual simulation faster
but samples the curve of each orbit more coarsely; if a body moves a large
fraction of its orbital radius in a single step, the integrator's
approximation starts to break down.

That's why *Figure-eight* uses $\Delta t = 0.001$ (a tight, fast-changing
orbit) while *Two-body* is perfectly comfortable at $\Delta t = 0.01$.`
          },
          {
            id: 'symplectic',
            label: 'Symplectic vs.\nNon-symplectic',
            body: String.raw`Symplectic integrators (semi-implicit Euler, velocity Verlet) preserve a
geometric structure of the equations of motion that keeps long-run energy
*oscillating* near the true value rather than drifting away from it.
Non-symplectic ones (explicit Euler, RK4) have no such guarantee — Euler
drifts badly and quickly, RK4 drifts extremely slowly.

This is a property of the *integration scheme*, not the force law — the same
gravity code in physics.js feeds all four.`
          },
          {
            id: 'auto-recovery',
            label: 'Auto-recovery\nGuard',
            body: String.raw`The simulation loop watches for any body flying past 50 world units or
producing a non-finite position, and automatically shrinks $\Delta t$ by 4×
to recover. That's the self-correction you might notice if a chaotic preset
briefly destabilizes.

It's a practical patch for *fixed-timestep* integrators near close
encounters — a numerical-method workaround, not a fix to the gravity law
itself.`
          },
          {
            id: 'chaos',
            label: 'Chaos &\nThree-Body',
            body: String.raw`Two bodies under gravity have an exact closed-form solution — an ellipse,
parabola, or hyperbola, solved by Kepler in the 1600s. **Three or more bodies
generally don't.** There's no general closed-form solution, and tiny
differences in starting conditions can grow exponentially over time.

*Binary + interloper* and the *Random cluster* preset are deliberately
chaotic for exactly this reason. The *Figure-eight* is a rare, genuinely
periodic exception, found by Chenciner & Montgomery in 2000.`
          }
        ]
      },
      {
        id: 'presets',
        label: 'Presets &\nInitial Conditions',
        color: '#b18cff',
        summary: 'Five hand-picked starting configurations, mirrored from the Python examples.',
        body: String.raw`Every preset in the side panel resets positions, velocities, and masses to
a specific, named configuration — each chosen to put a different physics
concept on display.`,
        children: [
          {
            id: 'preset-two-body',
            label: 'Two-body\nOrbit',
            body: String.raw`A heavy "sun" ($m=25$) sitting near the center and a light "planet"
($m=0.3$) given sideways velocity. This is the Kepler problem — the one case
with an exact analytic answer, which makes it the cleanest place to *see* an
integrator's error: switch to Euler and watch the "planet" visibly spiral
outward instead of holding its ellipse.`
          },
          {
            id: 'preset-figure-eight',
            label: 'Figure-Eight\nChoreography',
            body: String.raw`Three **equal**-mass bodies ($m=1$ each) chasing each other around a
literal figure-eight curve — the Chenciner–Montgomery solution, an exact
periodic three-body orbit discovered in 2000 (a genuine rarity; almost every
three-body configuration is chaotic). It needs $\Delta t = 0.001$ because the
bodies pass close to one another twice per period.`
          },
          {
            id: 'preset-cluster',
            label: 'Random\nCluster',
            body: String.raw`12 bodies scattered at random radii with rough "virial" tangential
velocities — just fast enough to roughly balance gravity's pull, plus
noise — like a toy star cluster. Nothing here is periodic; it's a genuinely
chaotic many-body system, included specifically to stress-test the
integrators and the $O(N^2)$ force sum.`
          },
          {
            id: 'preset-binary-chaos',
            label: 'Binary +\nInterloper',
            body: String.raw`Two heavy bodies ($m=6$ each) locked in a tight mutual orbit, with a
lighter third body ($m=1.2$) swinging through from outside. This is the
classic setup for **gravitational chaos**: the interloper's pass perturbs
the binary unpredictably, and tiny changes to its starting velocity send the
whole system down a completely different path — a hands-on demonstration of
sensitive dependence on initial conditions.`
          }
        ]
      }
    ]
  };

  const SAT_TREE = {
    id: 'sat-root',
    label: 'Separating Axis\nTheorem',
    summary: 'A method for detecting collisions between convex shapes.',
    body: String.raw`The Separating Axis Theorem (SAT) states that two convex
shapes are **not** colliding if there exists an axis along which their
projections do not overlap. To test two polygons, you check the axes
perpendicular to each edge: project both shapes onto each axis, and if
any axis shows a gap between the projections, the shapes are separated.
If no separating axis is found after checking them all, the shapes
must be overlapping.

**In a physics engine:** SAT powers the narrow-phase collision check.
For each candidate pair of bodies (found via a cheaper broad-phase
pass, e.g. bounding-box overlap), SAT runs to confirm an actual
collision and, on the axis with the *smallest* overlap, yields the
minimum translation vector (MTV) — giving both the contact normal and
penetration depth. That data feeds rigid-body resolution: bodies are
pushed apart along the normal, and an impulse is computed (using mass,
velocity, and restitution) and applied at the contact point to update
linear and angular velocities. Run across all colliding pairs each
step, this is what lets an engine scale SAT-based narrow-phase checks
up to full N-body dynamics.`,

    children: [
      {
        id: 'sat-detection',
        label: 'Collision\nDetection (SAT)',
        color: '#ffb000',
        summary: 'Proving two convex shapes do, or don\u2019t, touch.',
        body: String.raw`The Separating Axis Theorem is the geometric backbone of this engine:
two convex polygons do **not** intersect if and only if some axis exists on
which their projections don't overlap.`,
        children: [
          {
            id: 'sat-theorem',
            label: 'The Theorem',
            body: String.raw`Core claim: **two convex shapes do not intersect if and only if there
exists some axis on which their projected shadows don't overlap.**

Think of shining a flashlight on two shapes from many angles — find even one
angle where the shadows have a gap, and the shapes can't be touching.`
          },
          {
            id: 'sat-axes',
            label: 'Generating\nTest Axes',
            body: String.raw`In 2D, the candidate separating axes are simply the **normals**
(perpendiculars) to every edge of both polygons. For an edge vector
$\vec E = (x_2-x_1,\;y_2-y_1)$:

$$\vec N = (-y,\,x) \qquad\qquad \hat n = \frac{\vec N}{\lVert \vec N \rVert}$$

Rotate, then normalize — that's the whole recipe.`
          },
          {
            id: 'sat-projection',
            label: 'Vertex\nProjection',
            body: String.raw`Every vertex of both shapes gets projected onto the candidate axis with a
dot product:

$$P = \vec V \cdot \hat n$$

Collecting all of one shape's projections gives that shape's "shadow"
interval $[\min(P),\,\max(P)]$ on that axis.`
          },
          {
            id: 'sat-mtv',
            label: 'Overlap Check\n& the MTV',
            body: String.raw`If $\text{Min}_B > \text{Max}_A$ or $\text{Min}_A > \text{Max}_B$ on *any*
axis, the shapes are proven separated and the check short-circuits
immediately. If *every* axis shows overlap, they're colliding — and the axis
with the **smallest** overlap becomes the collision normal $\hat n_c$, with
overlap distance $d$ the penetration depth:

$$\vec{\text{MTV}} = d \cdot \hat n_c$$

This Minimum Translation Vector is exactly how far, and which way, to nudge
the shapes apart before the next frame renders.`
          }
        ]
      },
      {
        id: 'sat-kinematics',
        label: 'Rigid Body\nKinematics',
        color: '#4fd8e8',
        summary: 'How bodies move between collision checks.',
        body: String.raw`Once a frame begins, every rigid body moves through space the same way the
gravity sandbox's bodies do — Newtonian motion stepped forward by a fixed
$\Delta t$.`,
        children: [
          {
            id: 'sat-newton2',
            label: 'Newton\u2019s\nSecond Law',
            body: String.raw`Each rigid body turns its accumulated force into acceleration the standard
way:

$$\vec a = \frac{\vec F}{m}$$

Nothing exotic — the same law as the gravity sandbox, just applied per
rigid body instead of as a pairwise force.`
          },
          {
            id: 'sat-static-mass',
            label: 'Static / Infinite\nMass Objects',
            body: String.raw`Floors and walls are treated as having **infinite mass**, which sends
acceleration to exactly zero: $1/\infty = 0$. A static object can be pushed
on, but never itself gets pushed — a clean trick that lets one impulse
formula handle both "two falling boxes colliding" and "a box hitting a fixed
wall" without a special case.`
          },
          {
            id: 'sat-kinematic-update',
            label: 'Kinematic\nUpdates',
            body: String.raw`Between collisions, position and velocity update with semi-implicit
Euler — exactly the symplectic scheme from the gravity sandbox:

$$\vec v_{new} = \vec v + \vec a\,\Delta t \qquad\qquad \vec x_{new} = \vec x + \vec v_{new}\,\Delta t$$`
          }
        ]
      },
      {
        id: 'sat-resolution',
        label: 'Collision\nResolution',
        color: '#ff5fa0',
        summary: 'Turning a confirmed overlap into a believable bounce.',
        body: String.raw`Once SAT confirms an overlap, the engine applies an instantaneous force —
an **impulse** — at the contact boundary to change both bodies' velocities
in a single step.`,
        children: [
          {
            id: 'sat-relative-velocity',
            label: 'Relative\nVelocity',
            body: String.raw`First: how fast are the two bodies closing along the collision normal?

$$\vec v_{rel} = \vec v_B - \vec v_A \qquad\qquad v_n = \vec v_{rel}\cdot\hat n$$

If $v_n > 0$ the bodies are already separating — no impulse is needed, and
the resolution step is skipped entirely.`
          },
          {
            id: 'sat-restitution',
            label: 'Coefficient of\nRestitution',
            body: String.raw`$e$ controls bounciness: $e = 0$ is a lump of clay (all relative velocity
along the normal gets absorbed), $e = 1$ is a perfect superball (it's fully
reversed). $e$ is the one "material" knob in the whole resolution step.`
          },
          {
            id: 'sat-impulse-scalar',
            label: 'The Impulse\nScalar',
            body: String.raw`Combining conservation of momentum with the restitution coefficient gives
the exact impulse magnitude:

$$j = \frac{-(1+e)(\vec v_{rel}\cdot\hat n)}{\tfrac{1}{m_A} + \tfrac{1}{m_B}}$$

Heavier bodies (smaller $1/m$) absorb proportionally less of the velocity
change — a bowling ball barely flinches off a ping-pong ball.`
          },
          {
            id: 'sat-apply-impulse',
            label: 'Applying the\nImpulse',
            body: String.raw`The impulse vector $\vec J = j\hat n$ is split between the two bodies in
proportion to their *inverse* mass:

$$\vec v_A = \vec v_A - \frac{\vec J}{m_A} \qquad\qquad \vec v_B = \vec v_B + \frac{\vec J}{m_B}$$

Same vector, opposite signs — Newton's third law, baked directly into the
resolution math.`
          }
        ]
      },
      {
        id: 'sat-friction',
        label: 'Friction\n(Coulomb Model)',
        color: '#b18cff',
        summary: 'Why objects stop sliding instead of gliding forever.',
        body: String.raw`To stop objects from sliding endlessly across a surface like ice, the
engine evaluates a friction tangent vector right alongside the bounce
impulse.`,
        children: [
          {
            id: 'sat-tangent',
            label: 'The Tangent\nAxis',
            body: String.raw`Friction acts perpendicular to the collision normal, along the sliding
direction. The engine strips the normal component out of the relative
velocity to find it:

$$\hat t = \frac{\vec v_{rel} - (\vec v_{rel}\cdot\hat n)\hat n}{\big\lVert \vec v_{rel} - (\vec v_{rel}\cdot\hat n)\hat n \big\rVert}$$`
          },
          {
            id: 'sat-friction-magnitude',
            label: 'Friction\nMagnitude',
            body: String.raw`Mirrors the bounce-impulse formula, but along $\hat t$ instead of $\hat n$,
and with no restitution term — friction doesn't "bounce":

$$j_t = \frac{-(\vec v_{rel}\cdot\hat t)}{\tfrac{1}{m_A} + \tfrac{1}{m_B}}$$`
          },
          {
            id: 'sat-coulomb-clamp',
            label: 'Coulomb\nClamping',
            body: String.raw`Real friction can't exceed the normal force scaled by a friction
coefficient $\mu$ — that's Coulomb's law of friction. The engine clamps the
friction impulse to respect it:

$$\lvert j_t \rvert \le j \cdot \mu$$

then applies $\vec J_t = j_t\hat t$ back onto both bodies the same way the
bounce impulse was applied. This clamp is *why* a low-$\mu$ surface (ice)
lets things slide and a high-$\mu$ one (rubber on asphalt) grips and stops
quickly.`
          }
        ]
      }
    ]
  };

  const TREES = { live: LIVE_TREE, sat: SAT_TREE };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const STAGE_W = 1100, STAGE_H = 900;
  const CX = STAGE_W / 2, CY = STAGE_H / 2;
  const R1 = 220;   // center -> branch
  const R2 = 340;   // center -> child (when branch is expanded)

  let currentTreeKey = 'live';
  let expandedBranchId = null;
  let activeId = null; // currently shown-in-panel node id

  const stage = document.getElementById('mindmap-stage');
  const svg = document.getElementById('edges-svg');
  const panel = document.getElementById('detail-panel');
  const breadcrumb = document.getElementById('panel-breadcrumb');
  const accordionRoot = document.getElementById('accordion-root');

  function findNode(tree, id) {
    if (tree.id === id) return { node: tree, parent: null };
    for (const b of tree.children) {
      if (b.id === id) return { node: b, parent: tree };
      for (const c of b.children) {
        if (c.id === id) return { node: c, parent: b };
      }
    }
    return null;
  }

  function mdToHtml(body) {
    // Minimal markdown: **bold**, *italic*, `code`, paragraphs on blank lines.
    // HTML-escape first (so things like \sum_{i<j} can't be parsed as a tag),
    // then apply markdown. The browser correctly decodes &lt;/&gt; back into
    // plain "<"/">" text-node characters when this HTML is assigned via
    // innerHTML, which is exactly what MathJax needs to see — no manual
    // "unescape" step required (and doing one would reopen the HTML-injection
    // hole this escaping exists to close).
    const paragraphs = body.trim().split(/\n\s*\n/);
    return paragraphs.map(p => {
      const html = p
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      return '<p>' + html + '</p>';
    }).join('');
  }

  function typeset(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    }
  }

  // ---- Detail panel ---------------------------------------------------

  function showDetail(id) {
    const tree = TREES[currentTreeKey];
    const found = findNode(tree, id);
    if (!found) return;
    activeId = id;
    const { node, parent } = found;

    const crumbParts = [];
    if (parent && parent.id !== tree.id) {
      const grand = findNode(tree, parent.id).parent;
      if (grand) crumbParts.push(grand.label.replace(/\n/g, ' '));
    }
    if (parent) crumbParts.push(parent.label.replace(/\n/g, ' '));
    crumbParts.push(node.label.replace(/\n/g, ' '));
    breadcrumb.textContent = crumbParts.join(' \u203a ');

    const color = node.color || parent?.color || 'var(--amber)';
    panel.innerHTML =
      '<div class="panel-title" style="color:' + color + '">' + node.label.replace(/\n/g, ' ') + '</div>' +
      (node.summary ? '<div class="panel-summary">' + node.summary + '</div>' : '') +
      '<div class="panel-body">' + mdToHtml(node.body) + '</div>';

    typeset(panel);
    highlightActiveNode();
  }

  function highlightActiveNode() {
    stage.querySelectorAll('.node').forEach(el => {
      el.classList.toggle('active', el.dataset.id === activeId);
    });
  }

  // ---- Radial mind map (desktop / tablet) ------------------------------

  function angleForIndex(i, count) {
    return (-90 + (360 / count) * i) * (Math.PI / 180);
  }

  function makeNodeEl(node, x, y, kind) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node node-' + kind;
    btn.dataset.id = node.id;
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    if (node.color) {
      btn.style.setProperty('--node-color', node.color);
    }
    btn.innerHTML = node.label.split('\n').map(l => '<span>' + l + '</span>').join('');
    return btn;
  }

  function renderMindmap() {
    const tree = TREES[currentTreeKey];
    stage.querySelectorAll('.node').forEach(n => n.remove());
    svg.innerHTML = '';

    // root
    const root = makeNodeEl(tree, CX, CY, 'root');
    root.addEventListener('click', () => showDetail(tree.id));
    stage.appendChild(root);

    const branchCount = tree.children.length;
    tree.children.forEach((branch, i) => {
      const angle = angleForIndex(i, branchCount);
      const bx = CX + R1 * Math.cos(angle);
      const by = CY + R1 * Math.sin(angle);

      drawEdge(CX, CY, bx, by, branch.color, 1.4, 0.55);

      const bEl = makeNodeEl(branch, bx, by, 'branch');
      bEl.addEventListener('click', () => {
        expandedBranchId = (expandedBranchId === branch.id) ? null : branch.id;
        showDetail(branch.id);
        renderMindmap();
      });
      if (expandedBranchId === branch.id) bEl.classList.add('expanded');
      stage.appendChild(bEl);

      if (expandedBranchId === branch.id) {
        const n = branch.children.length;
        const spreadDeg = Math.min(78, 22 * (n - 1) || 0);
        const startDeg = (angle * 180 / Math.PI) - spreadDeg / 2;
        const stepDeg = n > 1 ? spreadDeg / (n - 1) : 0;

        branch.children.forEach((child, j) => {
          const cAngle = (startDeg + stepDeg * j) * (Math.PI / 180);
          const cx = CX + R2 * Math.cos(cAngle);
          const cy = CY + R2 * Math.sin(cAngle);

          drawEdge(bx, by, cx, cy, branch.color, 1, 0.4);

          const cEl = makeNodeEl(child, cx, cy, 'leaf');
          cEl.style.setProperty('--node-color', branch.color);
          cEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showDetail(child.id);
          });
          stage.appendChild(cEl);
        });
      }
    });

    highlightActiveNode();
  }

  function drawEdge(x1, y1, x2, y2, color, width, opacity) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color || '#6b7280');
    line.setAttribute('stroke-width', width);
    line.setAttribute('stroke-opacity', opacity);
    svg.appendChild(line);
  }

  function fitStage() {
    const wrap = document.getElementById('stage-wrap');
    if (!wrap) return;
    const scale = Math.min(1, (wrap.clientWidth - 4) / STAGE_W);
    stage.style.transform = 'scale(' + scale + ')';
    wrap.style.height = (STAGE_H * scale) + 'px';
  }

  // ---- Accordion (mobile fallback) -------------------------------------

  function renderAccordion() {
    const tree = TREES[currentTreeKey];
    accordionRoot.innerHTML = '';

    const rootCard = document.createElement('div');
    rootCard.className = 'acc-root';
    rootCard.innerHTML =
      '<div class="acc-root-title">' + tree.label.replace(/\n/g, ' ') + '</div>' +
      '<div class="panel-body">' + mdToHtml(tree.body) + '</div>';
    accordionRoot.appendChild(rootCard);

    tree.children.forEach(branch => {
      const det = document.createElement('details');
      det.className = 'acc-branch';
      det.style.setProperty('--node-color', branch.color);

      const sum = document.createElement('summary');
      sum.innerHTML = '<span class="acc-dot" style="background:' + branch.color + '"></span>' +
        branch.label.replace(/\n/g, ' ');
      det.appendChild(sum);

      const branchBody = document.createElement('div');
      branchBody.className = 'panel-body acc-branch-body';
      branchBody.innerHTML = mdToHtml(branch.body);
      det.appendChild(branchBody);

      branch.children.forEach(child => {
        const cDet = document.createElement('details');
        cDet.className = 'acc-leaf';

        const cSum = document.createElement('summary');
        cSum.textContent = child.label.replace(/\n/g, ' ');
        cDet.appendChild(cSum);

        const cBody = document.createElement('div');
        cBody.className = 'panel-body acc-leaf-body';
        cBody.innerHTML = mdToHtml(child.body);
        cDet.appendChild(cBody);

        cDet.addEventListener('toggle', () => { if (cDet.open) typeset(cBody); });
        det.appendChild(cDet);
      });

      accordionRoot.appendChild(det);
    });

    typeset(accordionRoot);
  }

  // ---- Tabs (Live vs SAT) ----------------------------------------------

  function setTree(key) {
    currentTreeKey = key;
    expandedBranchId = null;
    document.querySelectorAll('.tree-tab').forEach(b => b.classList.toggle('active', b.dataset.tree === key));
    document.getElementById('sat-disclaimer').style.display = key === 'sat' ? 'block' : 'none';
    renderMindmap();
    renderAccordion();
    showDetail(TREES[key].id);
    fitStage();
  }

  document.querySelectorAll('.tree-tab').forEach(btn => {
    btn.addEventListener('click', () => setTree(btn.dataset.tree));
  });

  document.getElementById('reset-view-btn').addEventListener('click', () => {
    expandedBranchId = null;
    renderMindmap();
    showDetail(TREES[currentTreeKey].id);
  });

  window.addEventListener('resize', fitStage);

  // ---- Boot --------------------------------------------------------------
  function boot() {
    renderMindmap();
    renderAccordion();
    showDetail(TREES[currentTreeKey].id);
    fitStage();
  }

  if (window.MathJax) {
    // MathJax config object already present (set in learn.html); hook ready.
    const prevReady = window.MathJax.startup && window.MathJax.startup.ready;
    window.MathJax.startup = window.MathJax.startup || {};
    window.MathJax.startup.ready = function () {
      if (window.MathJax.startup.defaultReady) window.MathJax.startup.defaultReady();
      typeset(panel);
      typeset(accordionRoot);
    };
  }

  boot();
})();
