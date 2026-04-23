export {
  getMissingSupabasePublicEnvVars,
  getSupabaseClient as getSupabaseBrowserClient,
  getSupabaseClientDiagnostics as getSupabaseBrowserClientEnvStatus,
  isSupabaseClientConfigured as isSupabaseBrowserClientConfigured,
  resolveAuthConfirmRedirectUrl,
  resolveFrontendAppUrl,
} from './client';
