import { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
// Side-effect: registers DefaultCollisionCoordinator (required for moveWithCollisions).
import '@babylonjs/core/Collisions/collisionCoordinator';
import type { GameEngine } from './Engine';

export class SceneManager {
  readonly scene: Scene;
  readonly hemi: HemisphericLight;
  readonly sun: DirectionalLight;
  readonly shadowGen: ShadowGenerator;

  constructor(gameEngine: GameEngine) {
    const scene = new Scene(gameEngine.engine);
    scene.clearColor = new Color4(0.55, 0.7, 0.85, 1);
    scene.ambientColor.set(0.4, 0.4, 0.45);
    scene.collisionsEnabled = true;

    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    this.hemi.intensity = 0.55;

    // 45° directional light
    const sunDir = new Vector3(-0.7, -1, -0.7).normalize();
    this.sun = new DirectionalLight('sun', sunDir, scene);
    this.sun.position = new Vector3(80, 120, 80);
    this.sun.intensity = 1.1;

    // Bootstrap camera so the engine has an active camera while we load assets.
    const bootCam = new FreeCamera('bootCam', new Vector3(0, 30, -50), scene);
    bootCam.setTarget(Vector3.Zero());
    scene.activeCamera = bootCam;

    this.shadowGen = new ShadowGenerator(2048, this.sun);
    this.shadowGen.usePercentageCloserFiltering = true;
    this.shadowGen.bias = 0.001;
    this.shadowGen.normalBias = 0.02;

    this.scene = scene;
  }

  dispose(): void {
    this.scene.dispose();
  }
}
