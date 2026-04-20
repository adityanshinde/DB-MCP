import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-site">
      <SiteHeader />
      <main className="app-site__main">{children}</main>
      <SiteFooter />
    </div>
  );
}
