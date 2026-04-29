import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
// Side-effect: attaches Scene.enablePhysics
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';

let havokInstancePromise: Promise<unknown> | null = null;

export class PhysicsManager {
  plugin: HavokPlugin | null = null;

  /**
   * Initialize Havok WASM and enable physics on the scene. Falls back gracefully
   * if Havok WASM cannot load (e.g. tests / sandbox without WASM support); the
   * game continues with kinematic-only movement (player still walks via
   * direct transforms; vehicles fall back to kinematic too).
   */
  async init(scene: Scene): Promise<boolean> {
    try {
      if (!havokInstancePromise) {
        const havok = await import('@babylonjs/havok');
        havokInstancePromise = havok.default();
      }
      const havokInstance = await havokInstancePromise;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plugin = new HavokPlugin(true, havokInstance as any);
      scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
      this.plugin = plugin;
      return true;
    } catch (err) {
      console.warn('[PhysicsManager] Havok unavailable; running in kinematic mode.', err);
      return false;
    }
  }

  get available(): boolean {
    return this.plugin !== null;
  }
}
