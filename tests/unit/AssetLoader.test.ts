import { describe, expect, it } from 'vitest';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { findImportedModelRoot } from '../../src/core/AssetLoader';

const node = (name: string, parent: TransformNode | null = null): TransformNode =>
  ({ name, parent, position: {}, scaling: {} }) as unknown as TransformNode;

const mesh = (name: string, parent: TransformNode | null = null): AbstractMesh =>
  node(name, parent) as unknown as AbstractMesh;

describe('findImportedModelRoot', () => {
  it('walks from the first mesh to the glTF __root__ transform node', () => {
    const root = node('__root__');
    const armature = node('Armature', root);
    const body = mesh('Body', armature);

    expect(findImportedModelRoot([body], [root, armature])).toBe(root);
  });

  it('keeps an unparented mesh as root for legacy imports', () => {
    const root = mesh('RootMesh');

    expect(findImportedModelRoot([root], [])).toBe(root);
  });

  it('throws when the import has no transformable nodes', () => {
    expect(() => findImportedModelRoot([], [])).toThrow(/no meshes or transform nodes/);
  });
});
