import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export type YamlValue = unknown;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep merge with "last writer wins" semantics.
 * - objects merge recursively
 * - arrays are replaced (not concatenated)
 * - primitives are replaced
 */
export function deepMerge(a: YamlValue, b: YamlValue): YamlValue {
    if (isRecord(a) && isRecord(b)) {
        const out: Record<string, unknown> = { ...a };
        for (const [k, v] of Object.entries(b)) {
            out[k] = k in out ? deepMerge(out[k], v) : v;
        }
        return out;
    }
    return b;
}

export function mergeYamlDocuments(yamlDocs: string[]): string {
    const merged = yamlDocs.reduce<YamlValue>((acc, doc) => {
        const parsed = parseYaml(doc) as YamlValue;
        return deepMerge(acc, parsed);
    }, {});
    return stringifyYaml(merged);
}

/** Merge two parsed YAML objects (e.g. base defaults + generated overlay). */
export function mergeValues(base: YamlValue, overlay: YamlValue): Record<string, unknown> {
    const merged = deepMerge(base, overlay);
    return merged as Record<string, unknown>;
}

