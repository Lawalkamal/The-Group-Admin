'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function JoinGate({ code, groupName }: { code: string; groupName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const response = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as { groupId?: string; error?: string };
      if (!alive) return;
      if (!response.ok || !data.groupId) {
        setError(data.error ?? 'Could not join that group.');
        return;
      }
      router.replace(`/groups/${data.groupId}`);
      router.refresh();
    })().catch(() => {
      if (alive) setError('Network hiccup. Try the code again from your groups.');
    });

    return () => {
      alive = false;
    };
  }, [code, router]);

  return (
    <div className="screen join-screen">
      <span className="monogram" aria-hidden>
        GA
      </span>
      <h1 className="display display--sm">{groupName}</h1>
      {error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <a className="btn btn--ink" href="/groups">
            Go to my groups
          </a>
        </>
      ) : (
        <p className="lede">Adding you to the group…</p>
      )}
    </div>
  );
}
