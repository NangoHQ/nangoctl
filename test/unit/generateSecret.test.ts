import { describe, expect, it } from 'vitest';

import { generateLocalSecrets } from '../../src/core/config/generateSecret.js';

describe('generateLocalSecrets', () => {
    it('is stable given a seed', () => {
        const a = generateLocalSecrets({ seed: 'seed-1', namespace: 'nango' });
        const b = generateLocalSecrets({ seed: 'seed-1', namespace: 'nango' });
        expect(a).toEqual(b);
    });

    it('changes when seed changes', () => {
        const a = generateLocalSecrets({ seed: 'seed-1', namespace: 'nango' });
        const b = generateLocalSecrets({ seed: 'seed-2', namespace: 'nango' });
        expect(a.secret.data.NANGO_ENCRYPTION_KEY).not.toEqual(b.secret.data.NANGO_ENCRYPTION_KEY);
    });
});

