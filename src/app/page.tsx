import { HomeScreen } from '@/components/catalog';
import { config } from '@/lib/config';
export default function HomePage() {
  return <HomeScreen localMode={config.localMode} />;
}
