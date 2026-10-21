import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/AuthScreen';
import { currentUser } from '@/lib/session';
import { getGroupByCode } from '@/lib/store';
import { checkInviteCode } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ code?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const user = await currentUser();
  if (user) redirect('/groups');

  const params = await searchParams;
  const code = checkInviteCode(params.code ?? '');
  const group = code.ok ? await getGroupByCode(code.value) : null;

  return (
    <AuthScreen
      code={group && code.ok ? code.value : null}
      groupName={group?.name ?? null}
      initialMode={params.mode === 'register' ? 'register' : 'signin'}
    />
  );
}
