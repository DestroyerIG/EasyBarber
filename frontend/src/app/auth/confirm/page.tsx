import { AuthConfirmView } from '@/components/auth/AuthConfirmView';

interface AuthConfirmPageProps {
  searchParams: Promise<{
    token_hash?: string | string[];
    tokenHash?: string | string[];
    type?: string | string[];
  }>;
}

const firstParamValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
};

export default async function AuthConfirmPage({ searchParams }: AuthConfirmPageProps) {
  const resolvedSearchParams = await searchParams;

  const tokenHash =
    firstParamValue(resolvedSearchParams.token_hash)
    || firstParamValue(resolvedSearchParams.tokenHash);
  const type = firstParamValue(resolvedSearchParams.type);

  return <AuthConfirmView tokenHash={tokenHash} type={type} />;
}
