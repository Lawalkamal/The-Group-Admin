import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="screen join-screen">
      <span className="monogram" aria-hidden>
        GA
      </span>
      <h1 className="display display--sm">Nothing here.</h1>
      <p className="lede">
        This group either does not exist or you are not a member. Membership is the only way in.
      </p>
      <Link className="btn btn--ink" href="/groups">
        Back to my groups
      </Link>
    </div>
  );
}
