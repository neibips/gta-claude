import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
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
    scene.clearColor = new Color4(0.62, 0.78, 0.92, 1);
    scene.ambientColor.set(0.45, 0.47, 0.52);
    scene.collisionsEnabled = true;

    // Linear distance fog for subtle haze without crushing nearby geometry.
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.62, 0.78, 0.92);
    scene.fogStart = 120;
    scene.fogEnd = 480;

    // Filmic tonemapping + gentle exposure for a modern look.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.15;
    ip.contrast = 1.05;

    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    this.hemi.intensity = 0.6;
    this.hemi.diffuse = new Color3(0.85, 0.92, 1.0);
    this.hemi.groundColor = new Color3(0.35, 0.32, 0.28);

    // 45° directional light — warmer sun tint.
    const sunDir = new Vector3(-0.7, -1, -0.7).normalize();
    this.sun = new DirectionalLight('sun', sunDir, scene);
    this.sun.position = new Vector3(80, 120, 80);
    this.sun.intensity = 1.4;
    this.sun.diffuse = new Color3(1.0, 0.95, 0.85);
    this.sun.specular = new Color3(1.0, 0.95, 0.85);

    // Bootstrap camera so the engine has an active camera while we load assets.
    const bootCam = new FreeCamera('bootCam', new Vector3(0, 30, -50), scene);
    bootCam.setTarget(Vector3.Zero());
    scene.activeCamera = bootCam;

    this.shadowGen = new ShadowGenerator(2048, this.sun);
    this.shadowGen.usePercentageCloserFiltering = true;
    this.shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    this.shadowGen.bias = 0.001;
    this.shadowGen.normalBias = 0.02;
    this.shadowGen.darkness = 0.35;

    this.scene = scene;
  }

  dispose(): void {
    this.scene.dispose();
  }
}
