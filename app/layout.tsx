import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'CareThread — Every handoff has a next step', description:'A voice-powered clinical handoff simulation. Keep pending work, ownership and uncertainty intact when care changes hands.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
