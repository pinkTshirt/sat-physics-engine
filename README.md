# 🧬 The Physics & Mathematics Behind the SAT Engine

The architecture is split into two primary pipelines: **Collision Detection** (identifying if and how shapes intersect using geometry) and **Collision Resolution** (calculating new velocities based on Newtonian mechanics).

---

## 1. Collision Detection: Separating Axis Theorem (SAT)

The Separating Axis Theorem is the geometric backbone of this engine. It states that:
> *Two convex polyhedra (or polygons in 2D) do not intersect if and only if there exists a line (axis) upon which their projections do not overlap.*

Think of it like shining a flashlight on two shapes from different angles. If you can find an angle where their shadows do not touch, the shapes are completely separated.

### Step A: Generating Test Axes
To determine if two polygons are colliding, the engine must test a finite set of potential separating axes. In 2D, these axes are the **normal vectors (perpendicular lines)** to every single edge of both shapes.

For any edge vector $\vec{E} = (x_2 - x_1, y_2 - y_1)$, its perpendicular normal vector $\vec{N}$ is calculated as:
$$\vec{N} = (-y, x)$$

This vector is then normalized to a unit vector ($\hat{n}$) to ensure consistent projection mathematics:
$$\hat{n} = \frac{\vec{N}}{\|\vec{N}\|}$$

### Step B: Vertex Projection
Next, every vertex of both polygons is projected onto the chosen unit normal axis ($\hat{n}$) using the vector **Dot Product**:
$$P = \vec{V} \cdot \hat{n}$$

By tracking the projections of all vertices for a single shape, we determine its shadow's span along that axis:
* $\text{Min} = \min(P_1, P_2, \dots, P_n)$
* $\text{Max} = \max(P_1, P_2, \dots, P_n)$

### Step C: Overlap Check & Minimum Translation Vector (MTV)
The engine checks if the projection intervals $[Min_A, Max_A]$ and $[Min_B, Max_B]$ overlap. 
* If **any single axis** shows a gap where $Min_B > Max_A$ or $Min_A > Max_B$, the theorem immediately proves the shapes **are not colliding**, and the loop breaks early (Short-circuit optimization).
* If **all axes** show an overlap, a collision is guaranteed. 

The engine logs the axis with the **smallest overlap amount**. This axis is designated as the collision normal ($\hat{n}_c$), and the overlap distance is the **penetration depth** ($d$). Together, they form the **Minimum Translation Vector (MTV)**:
$$\vec{\text{MTV}} = d \cdot \hat{n}_c$$

*Note: In the positional correction step, the engine shifts the shapes along this vector to instantly resolve intersection overlapping before rendering.*

---

## 2. Rigid Body Kinematics & Linear Dynamics

Once a frame begins, objects move through space using Euler integration to approximate Newtonian equations of motion over discrete time slices ($\Delta t$).

### Force Integration
Every physical rigid body processes accumulated linear forces ($\vec{F}$) to update its linear acceleration ($\vec{a}$), obeying **Newton's Second Law**:
$$\vec{a} = \frac{\vec{F}}{m}$$

Where $m$ is the mass of the object. For static objects (like floors or walls), mass is treated as infinite ($m = \infty$), which reduces acceleration down to zero ($1/\infty = 0$).

### Kinematic Updates
The engine updates linear velocity ($\vec{v}$) and spatial position ($\vec{x}$) point-by-point via:
$$\vec{v}_{\text{new}} = \vec{v}_{\text{old}} + \vec{a} \cdot \Delta t$$
$$\vec{x}_{\text{new}} = \vec{x}_{\text{old}} + \vec{v}_{\text{new}} \cdot \Delta t$$

---

## 3. Collision Resolution: Impulse Method

When an overlap is confirmed, the engine applies an instantaneous force (an **Impulse**, $\vec{J}$) at the contact boundary to change velocities instantly, simulating a realistic rebound.

### Relative Velocity
First, the engine determines the relative speed ($\vec{v}_{\text{rel}}$) between Body A and Body B along the collision normal ($\hat{n}$):
$$\vec{v}_{\text{rel}} = \vec{v}_B - \vec{v}_A$$
$$v_{\text{normal}} = \vec{v}_{\text{rel}} \cdot \hat{n}$$

If $v_{\text{normal}} > 0$, the objects are already moving apart, and the resolution physics step is safely skipped.

### Calculating the Impulse Scalar ($j$)
To find the exact magnitude of the bounce impulse, the engine uses the linear conservation of momentum equation combined with a Coefficient of Restitution ($e$), which determines how "bouncy" the material is ($0$ for a lump of clay, $1$ for a perfect superball):

$$j = \frac{-(1 + e)(\vec{v}_{\text{rel}} \cdot \hat{n})}{\frac{1}{m_A} + \frac{1}{m_B}}$$

### Applying the Impulse Vector
Once the scalar value $j$ is solved, the impulse vector $\vec{J} = j \cdot \hat{n}$ is distributed dynamically across both objects relative to their inverse mass weightings:
$$\vec{v}_A = \vec{v}_A - \frac{\vec{J}}{m_A}$$
$$\vec{v}_B = \vec{v}_B + \frac{\vec{J}}{m_B}$$

---

## 4. Friction Model (Coulomb Friction)

To prevent objects from sliding endlessly across surfaces like ice, a friction tangent vector is evaluated.

1. **Find the Tangent Axis:** The engine computes a direction vector perpendicular to the collision normal that matches the sliding path:
   $$\hat{t} = \vec{v}_{\text{rel}} - (\vec{v}_{\text{rel}} \cdot \hat{n})\hat{n}$$
   $$\hat{t} = \frac{\hat{t}}{\|\hat{t}\|}$$

2. **Calculate Friction Magnitude ($j_t$):** Using a similar formulation to the impulse bounce equation, the tangential resistance scalar is calculated:
   $$j_t = \frac{-(\vec{v}_{\text{rel}} \cdot \hat{t})}{\frac{1}{m_A} + \frac{1}{m_B}}$$

3. **Coulomb's Law Clamping:** According to Coulomb's Friction Law, the force of friction cannot exceed the normal clamping force scaled by the friction coefficient ($\mu$). The engine clamps the absolute friction impulse:
   $$|j_t| \le j \cdot \mu$$

The resulting validated friction impulse vector ($\vec{J}_t = j_t \cdot \hat{t}$) is then applied back to the bodies to accurately simulate surface dragging resistance.
