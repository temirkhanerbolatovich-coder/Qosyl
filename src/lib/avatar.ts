export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_PIXELS = 16_000_000;
export const MAX_STORED_AVATAR_BYTES = 512 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png';
export type AvatarMetadata = { revision: string; isPublic: boolean };
export function avatarUrl(userId: string, revision: string) {
  return `/api/avatars/${encodeURIComponent(userId)}?v=${encodeURIComponent(revision)}`;
}
