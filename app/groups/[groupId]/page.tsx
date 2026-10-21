import { notFound, redirect } from 'next/navigation';
import { ChatRoom } from '@/components/ChatRoom';
import { currentUser } from '@/lib/session';
import { getSnapshot } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ groupId: string }> };

export default async function GroupPage({ params }: Props) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const { groupId } = await params;
  const snapshot = await getSnapshot(groupId, user.id).catch(() => null);
  if (!snapshot) notFound();

  return <ChatRoom me={user} group={snapshot} />;
}
