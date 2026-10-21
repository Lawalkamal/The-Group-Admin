import Link from 'next/link';
import { AuthScreen } from '@/components/AuthScreen';
import { JoinGate } from '@/components/JoinGate';
import { currentUser } from '@/lib/session';
import { getGroupByCode } from '@/lib/store';
import { checkInviteCode } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ code: string }> };

export default async function JoinPage({ params }: Props) {
  const { code: raw } = await params;
  const code = checkInviteCode(raw);
  const group = code.ok ? await getGroupByCode(code.value) : null;

  if (!group || !code.ok) {
    return (
      <div className="screen join-screen">
        <span className="monogram" aria-hidden>
          GA
        </span>
        <h1 className="display display--sm">This invite is not valid.</h1>
        <p className="lede">
          The code may have been rotated. Ask the group admin for a fresh one, or sign in to your own groups.
        </p>
        <Link className="btn btn--ink" href="/groups">
          Go to my groups
        </Link>
      </div>
    );
  }

  const user = await currentUser();
  if (!user) {
    return <AuthScreen code={code.value} groupName={group.name} initialMode="register" />;
  }

  return <JoinGate code={code.value} groupName={group.name} />;
}
