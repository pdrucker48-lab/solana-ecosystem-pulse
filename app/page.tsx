import { Dashboard } from '@/components/dashboard';
import { fallbackSnapshot } from '@/lib/snapshot';

export default function Home() {
  return <Dashboard initialSnapshot={fallbackSnapshot} />;
}
