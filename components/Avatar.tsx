const TONES = [
  { bg: '#141414', fg: '#ffffff' },
  { bg: '#FBE7E0', fg: '#9C2E15' },
  { bg: '#E7EDE8', fg: '#264C36' },
  { bg: '#EAE8F5', fg: '#3B2C6E' },
  { bg: '#FAF0D9', fg: '#6F4B08' },
  { bg: '#E4EDF6', fg: '#1B466F' },
];

export function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  }
  return TONES[hash % TONES.length];
}

export function initialsFor(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type AvatarProps = {
  name: string;
  size?: number;
  className?: string;
};

export function Avatar({ name, size = 34, className }: AvatarProps) {
  const tone = toneFor(name);
  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        background: tone.bg,
        color: tone.fg,
        fontSize: Math.round(size * 0.36),
      }}
      aria-hidden
    >
      {initialsFor(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((name) => (
        <Avatar key={name} name={name} size={26} />
      ))}
      {names.length > max ? <span className="avatar-stack__more">+{names.length - max}</span> : null}
    </span>
  );
}
