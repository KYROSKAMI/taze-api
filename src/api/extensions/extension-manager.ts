/**
 * TAZE API — Modular Extension Management Engine
 * Inspired by Anisurge/Tachiyomi extensions architecture.
 * Manages extension manifests, capability checks, isolation, and lifecycle.
 */

import { ExtensionManifest } from '../types/index.ts';

const CURRENT_API_VERSION = '1.0.0';

export class ExtensionManager {
  private extensions: Map<string, ExtensionManifest> = new Map();

  constructor() {
    this.seedDefaultExtensions();
  }

  private seedDefaultExtensions(): void {
    const defaultManifests: ExtensionManifest[] = [
      {
        id: 'taze-ext-authorized-core',
        name: 'TAZE Core Authorized Streams',
        description: 'Official core streaming extension with multi-language audio and WebVTT subtitles.',
        version: '1.0.0',
        developer: 'TAZE Architecture Team',
        minApiVersion: '1.0.0',
        homepage: 'https://github.com/taze-app',
        enabled: true,
        capabilities: {
          supportsSub: true,
          supportsDub: true,
          supportsHls: true,
          supportsDash: true,
          supportsDirectMp4: true,
          supportsIntroOutro: true,
          supportsMultiAudio: true,
        },
        providerIds: ['authorized-demo'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'taze-ext-gogo-community',
        name: 'GogoAnime Community Connector',
        description: 'Community mirror connector for GogoCDN and Vidstreaming sources.',
        version: '1.1.0',
        developer: 'OpenAnime Community',
        minApiVersion: '1.0.0',
        homepage: 'https://anitaku.to',
        enabled: true,
        capabilities: {
          supportsSub: true,
          supportsDub: true,
          supportsHls: true,
          supportsDash: false,
          supportsDirectMp4: true,
          supportsIntroOutro: false,
          supportsMultiAudio: false,
        },
        providerIds: ['gogoanime'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'taze-ext-zoro-megacloud',
        name: 'MegaCloud Zoro Pipeline',
        description: 'Advanced MegaCloud extractor extension for HiAnime/Zoro video servers.',
        version: '1.0.4',
        developer: 'StreamWorks',
        minApiVersion: '1.0.0',
        homepage: 'https://hianime.to',
        enabled: true,
        capabilities: {
          supportsSub: true,
          supportsDub: true,
          supportsHls: true,
          supportsDash: false,
          supportsDirectMp4: false,
          supportsIntroOutro: true,
          supportsMultiAudio: false,
        },
        providerIds: ['zoro'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'taze-ext-animepahe-kwik',
        name: 'AnimePahe Kwik Module',
        description: 'Modular high-compression HLS stream provider with lightweight bandwidth profiles.',
        version: '0.9.2',
        developer: 'KwikTeam',
        minApiVersion: '1.0.0',
        enabled: false,
        capabilities: {
          supportsSub: true,
          supportsDub: false,
          supportsHls: true,
          supportsDash: false,
          supportsDirectMp4: true,
          supportsIntroOutro: false,
          supportsMultiAudio: false,
        },
        providerIds: ['animepahe'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const manifest of defaultManifests) {
      this.extensions.set(manifest.id, manifest);
    }
  }

  /**
   * Validate an incoming manifest according to TAZE specification
   */
  public validateManifest(manifest: Partial<ExtensionManifest>): { valid: boolean; error?: string } {
    if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.length < 3) {
      return { valid: false, error: 'Extension ID must be a non-empty string at least 3 characters long' };
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
      return { valid: false, error: 'Extension name is required' };
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      return { valid: false, error: 'Extension version must follow Semantic Versioning (e.g. 1.0.0)' };
    }
    if (!manifest.minApiVersion) {
      return { valid: false, error: 'minApiVersion is required' };
    }

    // Check version compatibility
    if (manifest.minApiVersion > CURRENT_API_VERSION) {
      return {
        valid: false,
        error: `Incompatible extension: requires API version >= ${manifest.minApiVersion}, current is ${CURRENT_API_VERSION}`,
      };
    }

    return { valid: true };
  }

  /**
   * List all registered extensions
   */
  public listExtensions(): ExtensionManifest[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get extension by ID
   */
  public getExtension(id: string): ExtensionManifest | undefined {
    return this.extensions.get(id);
  }

  /**
   * Install or register a new extension
   */
  public installExtension(manifest: ExtensionManifest): { success: boolean; message: string } {
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Manifest validation failed: ${validation.error}`);
    }

    manifest.updatedAt = new Date().toISOString();
    manifest.createdAt = manifest.createdAt || new Date().toISOString();
    this.extensions.set(manifest.id, manifest);

    return {
      success: true,
      message: `Extension ${manifest.name} (v${manifest.version}) registered successfully`,
    };
  }

  /**
   * Toggle enabled status
   */
  public toggleExtension(id: string, enabled: boolean): ExtensionManifest {
    const ext = this.extensions.get(id);
    if (!ext) {
      throw new Error(`Extension ${id} not found`);
    }

    ext.enabled = enabled;
    ext.updatedAt = new Date().toISOString();
    return ext;
  }

  /**
   * Remove an extension
   */
  public removeExtension(id: string): boolean {
    if (id === 'taze-ext-authorized-core') {
      throw new Error('Core extension cannot be uninstalled');
    }
    return this.extensions.delete(id);
  }
}

export const extensionManager = new ExtensionManager();
