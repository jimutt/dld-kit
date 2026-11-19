// @decision(DL-098)
/** The numbers of a plain `<major>.<minor>.<patch>` version, or undefined for anything else. */
export function parseVersion(text: string): [number, number, number] | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// @decision(DL-098)
/**
 * Whether the running version is at least `minimum`. A pre-release or build suffix on the
 * running version is ignored, so `1.2.0-rc.1` counts as `1.2.0`. A running version that cannot
 * be read satisfies nothing.
 */
export function satisfiesMinimum(running: string, minimum: string): boolean {
  const have = parseVersion(running.replace(/[-+].*$/, ""));
  const need = parseVersion(minimum);
  if (have === undefined || need === undefined) return false;
  for (let i = 0; i < 3; i++) {
    const difference = (have[i] ?? 0) - (need[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

// @decision(DL-098)
export function tooOldMessage(running: string, minimum: string): string {
  return `this project needs dld ${minimum} or newer; this is dld ${running}. Update dld-kit (npx dld-kit@latest update, or your plugin manager) and try again.`;
}
