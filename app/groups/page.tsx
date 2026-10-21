import { redirect } from 'next/navigation';
import { GroupsScreen } from '@/components/GroupsScreen';
import { currentUser } from '@/lib/session';
import { listGroups } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const groups = await listGroups(user.id);
  return <GroupsScreen user={user} initialGroups={groups} />;
}
