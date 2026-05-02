export const GameConfig = {
  map: { width: 600, height: 600 },
  world: {
    boundaryMargin: 18,
    fallKillY: -18,
  },
  player: {
    walkSpeed: 4,
    runSpeed: 9,
    capsule: { height: 1.8, radius: 0.3 },
    hp: 100,
    respawnDelayMs: 3000,
  },
  camera: {
    radius: 8,
    lowerRadiusLimit: 4,
    upperRadiusLimit: 14,
    lowerBetaLimit: 0.2,
    upperBetaLimit: Math.PI / 2 + 0.6,
    heightOffset: 3,
    wheelPrecision: 30,
    inertia: 0.85,
  },
  jump: {
    /** Fraction of the jump animation before liftoff (crouch / wind-up). */
    windupFraction: 0.28,
    /** Fraction of the jump animation spent airborne. */
    airborneFraction: 0.5,
    /** Clamp the computed initial vertical velocity (m/s). */
    minVelocity: 3.0,
    maxVelocity: 5.0,
    cooldownMs: 150,
    groundedYVel: 0.6,
  },
  npc: {
    max: 40,
    spawnIntervalMs: 3000,
    fleeTriggerRadius: 25,
    fleeSpeedMul: 2.5,
    walkSpeed: 2.4,
    corpseLimit: 10,
  },
  police: {
    hp: 80,
    fireIntervalMs: 1500,
    repositionIntervalMs: 3000,
    losMaxRange: 40,
    chaseSpeed: 5.5,
    flankSpeed: 6,
    patrolSpeed: 2.6,
    patrolCount: 3,
    /** Police spawned for wanted level appear at least this far from player and outside FOV. */
    offscreenSpawnMinDist: 35,
    offscreenSpawnMaxDist: 90,
  },
  traffic: {
    min: 16,
    max: 20,
    maxSpeed: 14,
    raycastDistance: 14,
    minSpawnDist: 16,
    reverseSpeed: -6,
    reverseSeconds: 1.1,
    stuckSeconds: 0.55,
    roadRetargetDistance: 11.5,
  },
  wanted: {
    max: 5,
    decayIntervalMs: 30_000,
    npcKillDelta: 1,
    policeKillDelta: 2,
  },
  weapons: {
    rpgExplosionRadius: 5,
    rpgKnockback: 15,
  },
} as const;
