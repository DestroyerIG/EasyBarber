import { ForgotPasswordView } from '@/components/auth/ForgotPasswordView';
import { resolveAppUrl } from '@/lib/appUrl';

export default function ForgotPasswordPage() {
  return <ForgotPasswordView appUrl={resolveAppUrl()} />;
}
