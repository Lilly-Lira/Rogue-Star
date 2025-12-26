// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Created by Lira for Rogue Star December 2025: Helpers for merging client-side body marking layers into preview/reference grids //
// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { normalizeHex, TRANSPARENT_HEX } from '../../../utils/color';
import {
  cloneGridData,
  type PreviewDirState,
} from '../../../utils/character-preview';
import type { PartMarkingLayers } from '../BasicAppearanceTab';

type MarkingLayerEntry = {
  grid: string[][];
};

const parseHex = (hex?: string | null): [number, number, number, number] => {
  if (!hex || typeof hex !== 'string') {
    return [0, 0, 0, 0];
  }
  const cleaned = normalizeHex(hex, {
    preserveTransparent: true,
    preserveAlpha: true,
  });
  if (!cleaned) {
    return [0, 0, 0, 0];
  }
  const raw = cleaned.startsWith('#') ? cleaned.slice(1) : cleaned;
  const safeRaw = raw || '';
  const r = parseInt(safeRaw.slice(0, 2), 16) || 0;
  const g = parseInt(safeRaw.slice(2, 4), 16) || 0;
  const b = parseInt(safeRaw.slice(4, 6), 16) || 0;
  const a = safeRaw.length >= 8 ? parseInt(safeRaw.slice(6, 8), 16) || 0 : 255;
  return [r, g, b, a];
};

const toHex = (r: number, g: number, b: number, a?: number) => {
  const channel = (value: number) =>
    (value < 16 ? '0' : '') + Math.max(0, Math.min(255, value)).toString(16);
  if (typeof a === 'number') {
    return `#${channel(r)}${channel(g)}${channel(b)}${channel(a)}`;
  }
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

const pixelHasColor = (value?: string): boolean =>
  typeof value === 'string' && value.length > 0 && value !== TRANSPARENT_HEX;

const compositePixel = (base: string | undefined, overlay: string): string => {
  if (!pixelHasColor(overlay)) {
    return base || TRANSPARENT_HEX;
  }
  if (!pixelHasColor(base)) {
    return overlay;
  }
  const [sr, sg, sb, sa] = parseHex(overlay);
  if (sa >= 255) {
    return overlay;
  }
  if (sa <= 0) {
    return base || TRANSPARENT_HEX;
  }
  const [dr, dg, db, da] = parseHex(base);
  const srcA = sa / 255;
  const dstA = da / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return TRANSPARENT_HEX;
  }
  const outR = Math.round((sr * srcA + dr * dstA * (1 - srcA)) / outA);
  const outG = Math.round((sg * srcA + dg * dstA * (1 - srcA)) / outA);
  const outB = Math.round((sb * srcA + db * dstA * (1 - srcA)) / outA);
  const outAlpha = Math.round(outA * 255);
  if (outAlpha <= 0) {
    return TRANSPARENT_HEX;
  }
  return toHex(outR, outG, outB, outAlpha);
};

const mergeGrid = (target: string[][], source?: string[][] | null) => {
  if (!Array.isArray(target) || !Array.isArray(source)) {
    return;
  }
  for (let x = 0; x < source.length; x += 1) {
    const srcCol = source[x];
    if (!Array.isArray(srcCol)) {
      continue;
    }
    if (!Array.isArray(target[x])) {
      target[x] = [];
    }
    for (let y = 0; y < srcCol.length; y += 1) {
      const val = srcCol[y];
      if (!pixelHasColor(val)) {
        continue;
      }
      target[x][y] = compositePixel(target[x][y], val);
    }
  }
};

const mergeMarkingLayers = (layers: MarkingLayerEntry[]): string[][] | null => {
  let merged: string[][] | null = null;
  layers.forEach((layer) => {
    if (!layer?.grid || !layer.grid.length) {
      return;
    }
    if (!merged) {
      merged = cloneGridData(layer.grid);
      return;
    }
    mergeGrid(merged, layer.grid);
  });
  return merged;
};

export const buildReferencePartMarkingGridsByDir = (
  layersByDir?: Record<number, Record<string, PartMarkingLayers>> | null
): Record<number, Record<string, string[][]>> => {
  const result: Record<number, Record<string, string[][]>> = {};
  if (!layersByDir) {
    return result;
  }
  Object.entries(layersByDir).forEach(([rawDir, partMap]) => {
    if (!partMap) {
      return;
    }
    const dirKey = Number(rawDir);
    if (!Number.isFinite(dirKey)) {
      return;
    }
    const output: Record<string, string[][]> = {};
    Object.entries(partMap).forEach(([partId, layers]) => {
      if (!partId || !layers) {
        return;
      }
      const merged = mergeMarkingLayers([
        ...(layers.normal || []),
        ...(layers.priority || []),
      ]);
      if (merged && merged.length) {
        output[partId] = merged;
      }
    });
    if (Object.keys(output).length) {
      result[dirKey] = output;
    }
  });
  return result;
};

export const buildHiddenBodyPartsByDir = (
  previewDirStates: Record<number, PreviewDirState>
): Record<number, Record<string, boolean>> => {
  const result: Record<number, Record<string, boolean>> = {};
  Object.values(previewDirStates || {}).forEach((dirState) => {
    const hiddenParts = dirState?.hiddenBodyParts;
    if (!dirState || !Array.isArray(hiddenParts) || !hiddenParts.length) {
      return;
    }
    const hiddenMap: Record<string, boolean> = {};
    hiddenParts.forEach((partId) => {
      if (typeof partId === 'string' && partId.length) {
        hiddenMap[partId] = true;
      }
    });
    if (Object.keys(hiddenMap).length) {
      result[dirState.dir] = hiddenMap;
    }
  });
  return result;
};
