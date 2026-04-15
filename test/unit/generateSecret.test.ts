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

    it('emits a valid RFC 4122 UUID for NANGO_ADMIN_UUID', () => {
        const { secret } = generateLocalSecrets({ seed: 'seed-1', namespace: 'nango' });
        expect(secret.data.NANGO_ADMIN_UUID).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });
});

