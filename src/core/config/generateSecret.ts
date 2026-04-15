import crypto from 'node:crypto';
import { z } from 'zod';
import { localPostgresUrl, localRedisUrl } from '../local/bitnamiLocalDeps.js';
import { SECRET_CLASSIFICATION } from './classifyKeys.js';

export const GeneratedSecretSchema = z.object({
    encryptionKey: z.string(),
    internalApiKey: z.string(),
    adminKey: z.string(),
    adminUuid: z.string(),
    adminInviteToken: z.string()
});
export type GeneratedSecret = z.infer<typeof GeneratedSecretSchema>;

function randomToken(bytes: number): string {
    return crypto.randomBytes(bytes).toString('base64url');
}

export function generateSecrets(seed?: Partial<GeneratedSecret>): GeneratedSecret {
    const next: GeneratedSecret = {
        encryptionKey: seed?.encryptionKey ?? randomToken(32),
        internalApiKey: seed?.internalApiKey ?? randomToken(24),
        adminKey: seed?.adminKey ?? randomToken(24),
        adminUuid: seed?.adminUuid ?? crypto.randomUUID(),
        adminInviteToken: seed?.adminInviteToken ?? randomToken(18)
    };
    return GeneratedSecretSchema.parse(next);
}

function deterministicToken(seed: string, label: string, bytes: number): string {
    // Deterministic base64url token derived from seed+label.
    // For local-only use; not a cryptographic KDF contract.
    const digest = crypto.createHash('sha256').update(`${seed}:${label}`).digest();
    return digest.subarray(0, bytes).toString('base64url');
}

/** Deterministic RFC 4122 UUID v4 from seed (required by `z.string().uuid()` in Nango env parsing). */
function deterministicUuidV4(seed: string, label: string): string {
    const digest = crypto.createHash('sha256').update(`${seed}:uuid:${label}`).digest();
    const bytes = Buffer.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const h = bytes.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export type LocalSecretsResult = {
    generated: GeneratedSecret;
    secret: {
        apiVersion: 'v1';
        kind: 'Secret';
        metadata: { name: string; namespace: string };
        type: 'Opaque';
        data: Record<string, string>;
    };
};

export function generateLocalSecrets(params: {
    seed: string;
    namespace: string;
    name?: string;
    postgresUrl?: string;
    redisUrl?: string;
}): LocalSecretsResult {
    const name = params.name ?? 'nango-local-secrets';

    const generated: GeneratedSecret = GeneratedSecretSchema.parse({
        encryptionKey: deterministicToken(params.seed, 'NANGO_ENCRYPTION_KEY', 32),
        internalApiKey: deterministicToken(params.seed, 'NANGO_INTERNAL_API_KEY', 24),
        adminKey: deterministicToken(params.seed, 'NANGO_ADMIN_KEY', 24),
        adminUuid: deterministicUuidV4(params.seed, 'NANGO_ADMIN_UUID'),
        adminInviteToken: deterministicToken(params.seed, 'NANGO_ADMIN_INVITE_TOKEN', 18)
    });

    const postgresUrl = params.postgresUrl ?? localPostgresUrl(params.namespace);
    const redisUrl = params.redisUrl ?? localRedisUrl(params.namespace);

    const data: Record<string, string> = {
        NANGO_ENCRYPTION_KEY: generated.encryptionKey,
        NANGO_INTERNAL_API_KEY: generated.internalApiKey,
        NANGO_ADMIN_KEY: generated.adminKey,
        NANGO_ADMIN_UUID: generated.adminUuid,
        NANGO_ADMIN_INVITE_TOKEN: generated.adminInviteToken,
        RUNNER_NODE_ID: '1',

        NANGO_DATABASE_URL: postgresUrl,
        ORCHESTRATOR_DATABASE_URL: postgresUrl,
        RUNNERS_DATABASE_URL: postgresUrl,
        RECORDS_DATABASE_URL: postgresUrl,
        NANGO_DB_READ_URL: postgresUrl,
        NANGO_REDIS_URL: redisUrl
    };

    return {
        generated,
        secret: {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: { name, namespace: params.namespace },
            type: 'Opaque',
            data
        }
    };
}

// Materialize a K8s Secret manifest (stringData so kubectl/helm will base64 it)
export function renderKubernetesSecret(params: {
    name: string;
    namespace: string;
    postgresUrl: string;
    redisUrl: string;
    secrets: GeneratedSecret;
}): string {
    // Keep mapping explicit; do not dump everything blindly.
    // Note: values here are representative; validate against actual runtime requirements as we iterate.
    const data: Record<string, string> = {
        NANGO_ENCRYPTION_KEY: params.secrets.encryptionKey,
        NANGO_INTERNAL_API_KEY: params.secrets.internalApiKey,
        NANGO_ADMIN_KEY: params.secrets.adminKey,
        NANGO_ADMIN_UUID: params.secrets.adminUuid,
        NANGO_ADMIN_INVITE_TOKEN: params.secrets.adminInviteToken,
        RUNNER_NODE_ID: '1',

        // Derived from local infra:
        NANGO_DATABASE_URL: params.postgresUrl,
        ORCHESTRATOR_DATABASE_URL: params.postgresUrl,
        RUNNERS_DATABASE_URL: params.postgresUrl,
        RECORDS_DATABASE_URL: params.postgresUrl,
        NANGO_DB_READ_URL: params.postgresUrl,
        NANGO_REDIS_URL: params.redisUrl
    };

    // Optional/disabled-by-default keys are intentionally omitted unless user opts in.
    // The classification table remains the source of truth for what is optional.
    void SECRET_CLASSIFICATION;

    const yamlLines: string[] = [];
    yamlLines.push('apiVersion: v1');
    yamlLines.push('kind: Secret');
    yamlLines.push('metadata:');
    yamlLines.push(`  name: ${params.name}`);
    yamlLines.push(`  namespace: ${params.namespace}`);
    yamlLines.push('type: Opaque');
    yamlLines.push('stringData:');
    for (const [k, v] of Object.entries(data)) {
        // Basic YAML escaping: quote and escape newlines.
        const safe = JSON.stringify(v);
        yamlLines.push(`  ${k}: ${safe}`);
    }
    return yamlLines.join('\n') + '\n';
}

