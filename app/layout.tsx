import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Card Table Arena', description: 'A social tabletop for hidden-card games.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
