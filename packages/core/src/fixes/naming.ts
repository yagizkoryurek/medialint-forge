/** Output file naming: `<base>.<suffix>.<ext>`, never equal to the input name. */
export function baseName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

export function outputName(inputFileName: string, suffix: string, ext: string): string {
  const base = baseName(inputFileName).replace(/[/\\:*?"<>|]/g, '_');
  const candidate = suffix ? `${base}.${suffix}.${ext}` : `${base}.${ext}`;
  return candidate.toLowerCase() === inputFileName.toLowerCase()
    ? `${base}.converted.${ext}`
    : candidate;
}
