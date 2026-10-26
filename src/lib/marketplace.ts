// Compatibility entry point; all database-backed operations live on the server.
import 'server-only';
export { mutateMarketplace, queryMarketplace } from '@/server/marketplace';
