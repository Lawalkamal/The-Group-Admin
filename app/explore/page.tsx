import { redirect } from 'next/navigation';
import { ExploreScreen } from '@/components/ExploreScreen';
import { currentUser } from '@/lib/session';
import { listExploreGroups } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const groups = await listExploreGroups(user.id);
  return <ExploreScreen initialGroups={groups} />;
}
