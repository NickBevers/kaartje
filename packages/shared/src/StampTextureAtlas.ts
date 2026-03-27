import {
  DataArrayTexture,
  LinearFilter,
  ClampToEdgeWrapping,
  RGBAFormat,
  UnsignedByteType,
  TextureLoader,
} from "three";

const LAYER_W = 128;
const LAYER_H = 86; // ~0.67 aspect ratio
const FALLBACK_COLOR = [0xc4, 0x5a, 0x3c, 0xff]; // stamp red

/**
 * Manages a DataArrayTexture where each layer is one stamp's front image.
 * Supports async loading, slot reuse, and per-layer updates.
 */
export class StampTextureAtlas {
  readonly texture: DataArrayTexture;
  /** Set of layer indices whose images have finished loading */
  readonly loadedLayers = new Set<number>();
  private data: Uint8Array;
  private capacity: number;
  private freeSlots: number[] = [];
  private usedCount = 0;

  constructor(initialCapacity = 256) {
    this.capacity = initialCapacity;
    this.data = new Uint8Array(LAYER_W * LAYER_H * 4 * initialCapacity);

    // Fill all layers with fallback color
    for (let layer = 0; layer < initialCapacity; layer++) {
      this.fillLayer(layer, FALLBACK_COLOR);
    }

    this.texture = new DataArrayTexture(this.data, LAYER_W, LAYER_H, initialCapacity);
    this.texture.format = RGBAFormat;
    this.texture.type = UnsignedByteType;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  /** Allocate a layer and start async image loading. Returns the layer index. */
  allocateLayer(url: string): number {
    let index: number;
    if (this.freeSlots.length > 0) {
      index = this.freeSlots.pop()!;
    } else {
      index = this.usedCount;
      this.usedCount++;
      if (index >= this.capacity) {
        this.grow();
      }
    }

    // Fill with fallback immediately
    this.fillLayer(index, FALLBACK_COLOR);
    this.texture.needsUpdate = true;

    // Load image async with retry
    if (typeof document !== "undefined") {
      this.loadImage(url, index, 0);
    }

    return index;
  }

  /** Load an image into a layer with retry on failure */
  private loadImage(url: string, index: number, attempt: number): void {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000 + attempt * 1500; // 1s, 2.5s, 4s

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = LAYER_W;
      canvas.height = LAYER_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, LAYER_W, LAYER_H);
      const pixels = ctx.getImageData(0, 0, LAYER_W, LAYER_H).data;

      const offset = index * LAYER_W * LAYER_H * 4;
      this.data.set(pixels, offset);
      this.texture.needsUpdate = true;
      this.loadedLayers.add(index);
    };
    img.onerror = () => {
      if (attempt < MAX_RETRIES) {
        setTimeout(() => this.loadImage(url, index, attempt + 1), RETRY_DELAY);
      }
    };
    // Stagger initial loads to avoid rate limiting
    const delay = attempt === 0 ? index * 30 : 0; // 30ms apart on first attempt
    if (delay > 0) {
      setTimeout(() => { img.src = url; }, delay);
    } else {
      img.src = url;
    }
  }

  /** Check if a layer's image has finished loading */
  isLoaded(index: number): boolean {
    return this.loadedLayers.has(index);
  }

  /** Release a layer for reuse */
  releaseLayer(index: number): void {
    this.loadedLayers.delete(index);
    this.fillLayer(index, FALLBACK_COLOR);
    this.freeSlots.push(index);
    this.texture.needsUpdate = true;
  }

  /** Fill a layer with a solid RGBA color */
  private fillLayer(index: number, color: number[]): void {
    const offset = index * LAYER_W * LAYER_H * 4;
    for (let i = 0; i < LAYER_W * LAYER_H; i++) {
      const p = offset + i * 4;
      this.data[p] = color[0];
      this.data[p + 1] = color[1];
      this.data[p + 2] = color[2];
      this.data[p + 3] = color[3];
    }
  }

  /** Double the capacity */
  private grow(): void {
    const newCapacity = this.capacity * 2;
    const newData = new Uint8Array(LAYER_W * LAYER_H * 4 * newCapacity);
    newData.set(this.data);

    // Fill new layers with fallback
    for (let i = this.capacity; i < newCapacity; i++) {
      const offset = i * LAYER_W * LAYER_H * 4;
      for (let j = 0; j < LAYER_W * LAYER_H; j++) {
        const p = offset + j * 4;
        newData[p] = FALLBACK_COLOR[0];
        newData[p + 1] = FALLBACK_COLOR[1];
        newData[p + 2] = FALLBACK_COLOR[2];
        newData[p + 3] = FALLBACK_COLOR[3];
      }
    }

    this.data = newData;
    this.capacity = newCapacity;

    // Recreate the texture data reference
    this.texture.image = { data: newData, width: LAYER_W, height: LAYER_H, depth: newCapacity };
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
