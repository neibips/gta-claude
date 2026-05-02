import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Node } from '@babylonjs/core/node';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

export type ModelRoot = AbstractMesh | TransformNode;

export type LoadedModel = {
  meshes: AbstractMesh[];
  animationGroups: AnimationGroup[];
  /**
   * The top-most node of the imported hierarchy. May be a TransformNode
   * (glTF `__root__`) rather than a mesh. In Babylon 8+ the glTF loader no
   * longer wraps the import in a Mesh, so we walk up from the first mesh.
   */
  rootMesh: ModelRoot;
};

export type AssetIndex = {
  player: { rig: string; idle: string; walk: string; run: string; punch: string; jump: string };
  npc: Array<{ name: string; rig: string; walk?: string; run?: string }>;
  policeman: { rig: string; walk: string; run: string };
  car: string[];
  guns: { ak47: string; rpg: string; water_gun: string };
};

export const ASSET_INDEX: AssetIndex = {
  player: {
    rig: 'assets/player/player_rig.glb',
    idle: 'assets/player/player_idle.glb',
    walk: 'assets/player/player_walking.glb',
    run: 'assets/player/player_running.glb',
    punch: 'assets/player/player_punch.glb',
    jump: 'assets/player/player_jump.glb',
  },
  npc: [
    {
      name: 'npc1',
      rig: 'assets/npc/1/Meshy_AI_biped_Character_output.glb',
      walk: 'assets/npc/1/Meshy_AI_biped_Animation_Walking_withSkin.glb',
      run: 'assets/npc/1/Meshy_AI_biped_Animation_Running_withSkin.glb',
    },
    {
      name: 'npc2',
      rig: 'assets/npc/2/Meshy_AI_Leather_Lion_biped_Character_output.glb',
      walk: 'assets/npc/2/Meshy_AI_Leather_Lion_biped_Animation_Walking_withSkin.glb',
      run: 'assets/npc/2/Meshy_AI_Leather_Lion_biped_Animation_Running_withSkin.glb',
    },
    {
      name: 'npc3',
      rig: 'assets/npc/3/Meshy_AI_Arms_Outstretched_biped_Character_output.glb',
      walk: 'assets/npc/3/Meshy_AI_Arms_Outstretched_biped_Animation_Walking_withSkin.glb',
      run: 'assets/npc/3/Meshy_AI_Arms_Outstretched_biped_Animation_Running_withSkin.glb',
    },
    {
      name: 'npc4',
      rig: 'assets/npc/4/Meshy_AI_Leather_Lion_biped_Character_output.glb',
      walk: 'assets/npc/4/Meshy_AI_Leather_Lion_biped_Animation_Walking_withSkin.glb',
      run: 'assets/npc/4/Meshy_AI_Leather_Lion_biped_Animation_Running_withSkin.glb',
    },
    {
      name: 'npc5',
      rig: 'assets/npc/5/Meshy_AI_Professor_Mohawk_Hams_biped_Character_output.glb',
      walk: 'assets/npc/5/Meshy_AI_Professor_Mohawk_Hams_biped_Animation_Walking_withSkin.glb',
      run: 'assets/npc/5/Meshy_AI_Professor_Mohawk_Hams_biped_Animation_Running_withSkin.glb',
    },
  ],
  policeman: {
    rig: 'assets/policeman/policeman_rig.glb',
    walk: 'assets/policeman/policeman_walking_rig.glb',
    run: 'assets/policeman/policeman_running_rig.glb',
  },
  car: ['assets/car/vaz-2107/2107.glb'],
  guns: {
    ak47: 'assets/gun/ak_47.glb',
    rpg: 'assets/gun/rpg.glb',
    water_gun: 'assets/gun/water_gun.glb',
  },
};

function isModelRoot(node: Node | null | undefined): node is ModelRoot {
  return !!node && 'position' in node && 'scaling' in node;
}

export function findImportedModelRoot(
  meshes: readonly AbstractMesh[],
  transformNodes: readonly TransformNode[]
): ModelRoot {
  const firstNode = meshes[0] ?? transformNodes[0];
  if (!firstNode) {
    throw new Error('Imported model contains no meshes or transform nodes');
  }

  let root: ModelRoot = firstNode;
  while (isModelRoot(root.parent)) {
    root = root.parent;
  }
  return root;
}

export class AssetLoader {
  constructor(private readonly scene: Scene) {
    SceneLoader.ShowLoadingScreen = false;
  }

  /** Load a glTF/GLB and return its meshes + animation groups. */
  async loadModel(url: string): Promise<LoadedModel> {
    const result = await ImportMeshAsync(url, this.scene);
    const meshes = result.meshes;
    const root = findImportedModelRoot(meshes, result.transformNodes ?? []);
    return {
      meshes,
      animationGroups: result.animationGroups ?? [],
      rootMesh: root,
    };
  }

  async loadContainer(url: string): Promise<AssetContainer> {
    return LoadAssetContainerAsync(url, this.scene);
  }
}
