export type Classification =
    | 'keep_as_is'
    | 'override_in_local'
    | 'generate_automatically'
    | 'derive_from_local_infra'
    | 'optional_in_mvp'
    | 'disable_in_local'
    | 'require_user_input';

export type KeyClass = {
    key: string;
    classification: Classification;
    notes?: string;
};

// This file intentionally starts as a data-only source of truth.
// MVP: keep it small; evolve as we discover real required keys.
export const CONFIG_KEY_CLASSIFICATIONS: KeyClass[] = [
    { key: 'NODE_ENV', classification: 'override_in_local', notes: 'development' },
    { key: 'SERVER_RUN_MODE', classification: 'override_in_local', notes: 'KUBERNETES_LOCAL' },
    { key: 'NANGO_SERVER_URL', classification: 'override_in_local', notes: 'http://localhost:<port>' },
    { key: 'NANGO_PUBLIC_SERVER_URL', classification: 'override_in_local', notes: 'http://localhost:<port>' },
    { key: 'NANGO_PUBLIC_CONNECT_URL', classification: 'override_in_local', notes: 'http://localhost:<port>/connect' },
    { key: 'ORCHESTRATOR_DB_SSL', classification: 'disable_in_local', notes: 'false' },
    { key: 'NANGO_DB_SSL', classification: 'disable_in_local', notes: 'false' },
    { key: 'RECORDS_DATABASE_SSL', classification: 'disable_in_local', notes: 'false' },
    { key: 'DD_TRACING_ENABLED', classification: 'disable_in_local', notes: 'false' },
    { key: 'DD_TRACE_ENABLED', classification: 'disable_in_local', notes: 'false' },
    { key: 'NANGO_LOGS_ENABLED', classification: 'disable_in_local', notes: 'false' }
];

export const SECRET_KEY_CLASSIFICATIONS: KeyClass[] = [
    { key: 'NANGO_ENCRYPTION_KEY', classification: 'generate_automatically' },
    { key: 'NANGO_INTERNAL_API_KEY', classification: 'generate_automatically' },
    { key: 'NANGO_ADMIN_KEY', classification: 'generate_automatically' },
    { key: 'NANGO_ADMIN_UUID', classification: 'generate_automatically' },
    { key: 'NANGO_ADMIN_INVITE_TOKEN', classification: 'generate_automatically' },
    { key: 'NANGO_DATABASE_URL', classification: 'derive_from_local_infra' },
    { key: 'ORCHESTRATOR_DATABASE_URL', classification: 'derive_from_local_infra' },
    { key: 'RECORDS_DATABASE_URL', classification: 'derive_from_local_infra' },
    { key: 'NANGO_REDIS_URL', classification: 'derive_from_local_infra' }
];

