// 6-DOF-ish rigid body used by player, rivals, traffic and obstacles.

export class RigidBody3D {
  constructor(opts) {
    this.reset(opts);
  }

  /** (Re)initialise in place, so pools can recycle bodies without allocating (ticket 0074). */
  reset(opts) {
    this.id = opts.id || ('RB_' + Math.random());
    this.kind = opts.kind || 'OBSTACLE'; // 'RIVAL', 'TRAFFIC', 'OBSTACLE'
    this.type = opts.type || 'HOLO_BARRIER';
    this.name = opts.name || 'OBJECT';
    this.style = opts.style || 'SEDAN';
    // 3D World Coordinates & Velocities
    this.offset = opts.offset || 0;          // Lateral lane position [-0.72, +0.72]
    this.prevOffset = this.offset;
    this.y = opts.y || 0;                    // Vertical CG height above track
    this.worldZ = opts.worldZ || 1000;       // Longitudinal Z position along track
    this.prevZ = this.worldZ;
    this.vx = opts.vx || 0;                  // Lateral velocity (lane units/s)
    this.vy = opts.vy || 0;                  // Vertical velocity (units/s)
    this.vz = opts.vz || 0;                  // Longitudinal velocity (worldZ units/s)
    this.mph = opts.mph || 0;
    this.baseMph = opts.baseMph || 0;
    this.targetOffset = this.offset;
    // 6-DOF Mass, Moment of Inertia, Restitution, Friction & Aerodynamic Drag
    this.massKg = opts.massKg || 150;
    // Static bodies (infinite mass, e.g. a tree) never move; impulses can't change them.
    this.isStatic = !Number.isFinite(this.massKg);
    this.invMass = this.isStatic ? 0 : 1 / Math.max(1, this.massKg);
    this.inertia = this.isStatic ? Infinity : this.massKg * 0.18; // I = m * r^2
    this.invInertia = this.isStatic ? 0 : 1 / this.inertia;
    this.restitution = opts.restitution !== undefined ? opts.restitution : 0.52;
    this.friction = opts.friction !== undefined ? opts.friction : 2.4;
    this.dragCoeff = opts.dragCoeff || 0.0012;
    // 3D Bounding Box
    this.halfW = opts.halfW || 0.15;
    this.height = opts.height || 38;
    this.clearanceY = opts.clearanceY || 0;
    this.halfL = opts.halfL || 110;
    // 6-DOF Angular State (Roll, Pitch, Yaw Spin & Suspension Oscillator)
    this.rot = 0;       // Roll/tumble angle (rad)
    this.vRot = 0;      // Roll angular velocity (rad/s)
    this.yaw = 0;       // Fishtail / PIT-maneuver yaw angle (rad)
    this.vYaw = 0;      // Yaw angular velocity (rad/s)
    this.suspY = 0;     // 4-wheel suspension spring compression
    this.suspVY = 0;
    this.hitCount = 0;
    this.bodyColor = opts.bodyColor || '#334155';
    this.accentColor = opts.accentColor || '#64748b';
    this.underglow = opts.underglow || null;
    this.oncoming = Boolean(opts.oncoming);
    this.nosActive = false;
    this.nearMissed = false;
    this.takenDown = false;
    this.collected = false;
    this.respawnTimer = 0;
    // Sleeping (ticket 0074): props at rest skip integration until something hits them.
    this.sleeping = false;
    this.restTime = 0;
    this.knockable = Boolean(opts.knockable);
    this.active = true;
    return this;
  }

  wake() {
    this.sleeping = false;
    this.restTime = 0;
  }

  applyImpulseAndTorque(jx, jy, jz, contactLeverX) {
    if (this.isStatic) return;
    this.wake();
    this.vx += jx * this.invMass;
    this.vy += jy * this.invMass;
    this.vz += jz * this.invMass;
    // Off-center impact generates real Torque tau = r x J!
    const torqueYaw = contactLeverX * (jz * 0.012) - jx * 0.35;
    this.vYaw += torqueYaw * this.invInertia * 65;
    this.vRot += (jx * 0.8 + (jy > 50 ? (contactLeverX >= 0 ? 6 : -6) : 0));
    this.suspVY -= Math.min(180, Math.abs(jy) * 0.35 + 45);
  }

  stepSubPhysics(subDt, subRawDt) {
    if (this.isStatic || this.sleeping) return;
    // 1. Integrate 3D Linear & Angular Velocities
    this.offset += this.vx * subDt;
    this.y += this.vy * subRawDt;
    this.worldZ += this.vz * subDt;
    this.rot += this.vRot * subRawDt;
    this.yaw += this.vYaw * subRawDt;

    // 2. Hooke's Law Spring-Damper Suspension Oscillator (F = -k*y - c*vy)
    const kSpring = 210;
    const cDamper = 19;
    const springAccel = -kSpring * this.suspY - cDamper * this.suspVY;
    this.suspVY += springAccel * subRawDt;
    this.suspY += this.suspVY * subRawDt;

    // 3. Newtonian Gravity & Ground Normal Bounce with Angular Spin Transfer
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 1580 * subRawDt;
      if (this.y <= 0) {
        this.y = 0;
        if (Math.abs(this.vy) > 110) {
          this.suspVY = -Math.abs(this.vy) * 0.28; // Compress suspension on landing!
          this.vy = -this.vy * this.restitution;
          this.vRot *= 0.72;
        } else {
          this.vy = 0;
          this.vRot *= Math.max(0, 1 - 6.0 * subRawDt);
          this.rot *= Math.max(0, 1 - 6.0 * subRawDt);
        }
      }
    }

    // 4. Tire Cornering Restoring Force, Aerodynamic Drag & Surface Friction
    if (this.kind === 'OBSTACLE') {
      if (this.y <= 1) {
        this.vx *= Math.max(0, 1 - this.friction * subRawDt);
        this.vz *= Math.max(0, 1 - this.friction * subRawDt);
        this.vYaw *= Math.max(0, 1 - 4.0 * subRawDt);
        this.vRot *= Math.max(0, 1 - 5.0 * subRawDt); // rolling friction: a tumble stops
      } else {
        // Air drag while flying
        this.vz *= Math.max(0, 1 - 0.35 * subRawDt);
      }
    } else {
      // Vehicle tire lateral grip & yaw self-aligning torque
      const tireGripDamp = Math.abs(this.yaw) > 0.35 ? 2.2 : 5.2; // Less grip when spinning out (PIT maneuver!)
      this.vx *= Math.max(0, 1 - tireGripDamp * subRawDt);
      this.vYaw *= Math.max(0, 1 - 4.5 * subRawDt);
      this.yaw *= Math.max(0, 1 - 3.8 * subRawDt);
      this.vRot *= Math.max(0, 1 - 6.0 * subRawDt);
      this.rot = (this.vx * -0.14) + this.yaw * 0.25; // Dynamic body roll on lane changes!
    }

    // 5. Hard Toy-Track Extruded Side-Wall Rigid-Body Rebound (x in [-0.72, +0.72])
    const maxWallOffset = 0.72 - this.halfW * 0.25;
    if (this.offset < -maxWallOffset) {
      this.offset = -maxWallOffset;
      if (this.vx < 0) {
        this.vx = -this.vx * this.restitution;
        this.vYaw += 1.8;
      }
    } else if (this.offset > maxWallOffset) {
      this.offset = maxWallOffset;
      if (this.vx > 0) {
        this.vx = -this.vx * this.restitution;
        this.vYaw -= 1.8;
      }
    }

    // 6. Fall asleep once settled on the ground (obstacles/props only; cars always drive).
    if (this.kind === 'OBSTACLE') {
      const still = this.y <= 0 && this.vy === 0 && Math.abs(this.vx) < 0.01 && Math.abs(this.vz) < 4 && Math.abs(this.vRot) < 0.2;
      this.restTime = still ? this.restTime + subRawDt : 0;
      if (this.restTime > 0.35) {
        this.sleeping = true;
        this.vx = 0; this.vz = 0; this.vRot = 0; this.vYaw = 0;
      }
    }
  }
}
