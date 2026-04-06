import { EmailVerificationView } from '@/components/auth/EmailVerificationView';

interface VerifyEmailPageProps {
  searchParams: Promise<{
    token?: string | string[];
    email?: string | string[];
  }>;
}

const firstParamValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const resolvedSearchParams = await searchParams;

  const token = firstParamValue(resolvedSearchParams.token);
  const email = firstParamValue(resolvedSearchParams.email) || '';

  return <EmailVerificationView initialToken={token} initialEmail={email} />;
}
