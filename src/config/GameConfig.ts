export const GameConfig = {
  map: { width: 200, height: 200 },
  player: {
    walkSpeed: 4,
    runSpeed: 9,
    capsule: { height: 1.8, radius: 0.3 },
    hp: 100,
    respawnDelayMs: 3000,
  },
  camera: {
    radius: 8,
    heightOffset: 3,
    wheelPrecision: 30,
    inertia: 0.85,
  },
  npc: {
    max: 60,
    spawnIntervalMs: 4000,
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
  },
  traffic: { min: 3, max: 5, maxSpeed: 14, raycastDistance: 10 },
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
