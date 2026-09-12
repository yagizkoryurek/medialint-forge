export const ENGINE_VERSION = '0.1.0';

export { canUseThreads, createWasmEngine, WasmEngine, type WasmEngineOptions } from './engine';
export { type ImageHeader, readImageHeader } from './image/header';
export { detectImageEncoders, render, stripMetadata } from './image/ops';
export { probeImage } from './image/probe';
export { type StripResult, stripJpegMetadata } from './strip/jpeg';
export { stripPngMetadata } from './strip/png';
export { stripWebpMetadata } from './strip/webp';
