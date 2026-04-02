import { AuthForm } from '@/components/auth/AuthForm';

interface CadastroPageProps {
  searchParams: Promise<{ plan?: string | string[] }>;
}

export default async function CadastroPage({ searchParams }: CadastroPageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedPlan = Array.isArray(resolvedSearchParams?.plan)
    ? resolvedSearchParams.plan[0]
    : resolvedSearchParams?.plan;

  return <AuthForm mode="register" selectedPlan={selectedPlan || null} />;
}
