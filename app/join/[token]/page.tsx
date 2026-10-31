import Receiver from '@/components/receiver';
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <Receiver token={token}/>;}
