export interface AdminAccount {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  snapshot_updated_at: string | null;
  has_snapshot: boolean;
}

export interface AdminAccountDetail {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed: boolean;
  };
  snapshot: Record<string, unknown> | null;
  updated_at: string | null;
}

export interface AdminAuditEntry {
  id: string;
  actor_id: string;
  target_user_id: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export interface PrivatePhotoCandidate {
  id: string;
  label: string;
  path: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unavailable' : date.toLocaleString();
}

export function humanizeAdminError(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return detail ? `${fallback}: ${detail}` : fallback;
}

/** Only storage keys under the selected account's private prefix can be previewed. */
function privatePathForUser(value: unknown, userId: string): value is string {
  return typeof value === 'string' && value.startsWith(`${userId}/`) && !/^https?:\/\//i.test(value);
}

/**
 * Snapshot data can contain arbitrary user content, so this deliberately reads only the
 * documented private image fields. No external or legacy image URLs are followed.
 */
export function privatePhotoCandidates(snapshot: Record<string, unknown> | null, userId: string): PrivatePhotoCandidate[] {
  if (!snapshot) return [];
  const candidates: PrivatePhotoCandidate[] = [];
  const add = (label: string, path: unknown) => {
    if (!privatePathForUser(path, userId)) return;
    if (!candidates.some((candidate) => candidate.path === path)) {
      candidates.push({ id: `${candidates.length}-${path}`, label, path });
    }
  };

  const settings = object(snapshot.settings);
  add('Profile photo', settings?.avatarPath);

  const albums = Array.isArray(snapshot.albums) ? snapshot.albums : [];
  albums.forEach((album, albumIndex) => {
    const record = object(album);
    if (!record) return;
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : `Album ${albumIndex + 1}`;
    add(`${title} cover`, record.coverImage);
    const memories = Array.isArray(record.memories) ? record.memories : [];
    memories.forEach((memory, memoryIndex) => {
      const item = object(memory);
      if (!item) return;
      const memoryTitle = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `Memory ${memoryIndex + 1}`;
      add(`${title} · ${memoryTitle}`, item.imagePath);
    });
  });
  return candidates;
}

/** Render useful audit metadata while never surfacing credential-like values. */
export function safeAuditMetadata(value: unknown): unknown {
  const sensitiveKey = /(password|token|credential|secret|session|authorization|access[_-]?key)/i;
  if (Array.isArray(value)) return value.map(safeAuditMetadata);
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, sensitiveKey.test(key) ? '[redacted]' : safeAuditMetadata(item)]));
}

export function shortIdentifier(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
