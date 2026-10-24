import type {Metadata} from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
export const metadata:Metadata={title:'Supply Continuity — Keep food moving.',description:'Food supply continuity with Amazon Bedrock: trace dependencies, allocate alternatives, and review recovery plans.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
