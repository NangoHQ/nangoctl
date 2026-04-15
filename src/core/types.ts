/** JSON-serializable values (for CLI JSON output). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
