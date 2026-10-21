'use client';

import { useEffect, useState } from 'react';

function StatusIcons() {
  return (
    <span className="status-icons" aria-hidden>
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
        <rect x="0" y="7" width="3" height="4" rx="1" />
        <rect x="4.6" y="5" width="3" height="6" rx="1" />
        <rect x="9.2" y="2.6" width="3" height="8.4" rx="1" />
        <rect x="13.8" y="0.5" width="3" height="10.5" rx="1" />
      </svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M1 4.1a9.6 9.6 0 0113 0" />
        <path d="M3.4 6.6a6 6 0 018.2 0" />
        <path d="M5.8 9a2.6 2.6 0 013.4 0" />
      </svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
        <rect x="0.6" y="0.6" width="21" height="10.8" rx="3" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="2.2" y="2.2" width="16" height="7.6" rx="1.8" fill="currentColor" />
        <path d="M23.2 4.2v3.6a1.9 1.9 0 000-3.6z" fill="currentColor" fillOpacity="0.5" />
      </svg>
    </span>
  );
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      if (window.innerWidth < 700) {
        setScale(1);
        return;
      }
      const next = Math.min(1, (window.innerHeight - 44) / 956, (window.innerWidth - 44) / 500);
      setScale(Math.max(0.52, Number(next.toFixed(3))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="stage">
      <div className="device" style={{ transform: `scale(${scale})` }}>
        <div className="device__frame">
          <div className="device__screen">
            <div className="statusbar" aria-hidden>
              <span className="statusbar__time">9:41</span>
              <StatusIcons />
            </div>
            <div className="island" aria-hidden>
              <span className="island__camera" />
            </div>
            <main className="app">{children}</main>
            <div className="home-bar" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
