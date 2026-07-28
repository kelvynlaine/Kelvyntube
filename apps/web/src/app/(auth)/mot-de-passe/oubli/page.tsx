import type { Metadata } from 'next';
import { ForgotPasswordScreen } from '@/components/auth/ForgotPasswordScreen';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
