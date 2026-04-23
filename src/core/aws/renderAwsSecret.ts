import YAML from 'yaml';

import { LOCAL_AWS_CREDENTIALS_SECRET_NAME } from '../state.js';
import type { ExportedAwsCredentials } from './exportCredentials.js';

export function renderAwsCredentialsSecretManifest(opts: {
  namespace: string;
  name?: string;
  region: string;
  creds: ExportedAwsCredentials;
}): string {
  const name = opts.name ?? LOCAL_AWS_CREDENTIALS_SECRET_NAME;
  const stringData: Record<string, string> = {
    AWS_ACCESS_KEY_ID: opts.creds.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: opts.creds.SecretAccessKey,
    AWS_DEFAULT_REGION: opts.region,
    AWS_REGION: opts.region,
  };
  if (opts.creds.SessionToken) {
    stringData.AWS_SESSION_TOKEN = opts.creds.SessionToken;
  }
  const manifest = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name,
      namespace: opts.namespace,
      labels: { 'app.kubernetes.io/managed-by': 'nangoctl' },
    },
    type: 'Opaque',
    stringData,
  };
  return YAML.stringify(manifest);
}
