'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Dashboard' },
  { href: '/estimates', label: 'Estimates' },
  { href: '/tasks', label: 'Tasks' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav-tabs">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={path === t.href ? 'nav-tab active' : 'nav-tab'}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
