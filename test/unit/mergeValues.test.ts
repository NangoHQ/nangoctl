import { describe, expect, it } from 'vitest';

import { deepMerge } from '../../src/core/values/mergeValues';

describe('deepMerge', () => {
    it('merges objects recursively', () => {
        const a = { a: 1, b: { c: 2, d: 3 } };
        const b = { b: { c: 20 }, e: 5 };
        expect(deepMerge(a, b)).toEqual({ a: 1, b: { c: 20, d: 3 }, e: 5 });
    });

    it('replaces arrays by default', () => {
        expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
    });
});

