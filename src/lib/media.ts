import { cloudEnabled, supabase } from './supabase';

export const MEDIA_BUCKET = 'life-media';
export const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // Leave headroom below the bucket's 5 MiB limit.
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type MediaKind = 'avatars' | 'albums';

export interface CompressedImage {
  file: File;
  originalBytes: number;
  width: number;
  height: number;
}

function mediaError(message: string): Error {
  return new Error(message);
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : 'webp';
}

function ownPath(userId: string, path: string) {
  return path.startsWith(`${userId}/`);
}

async function activeUserId(expectedUserId: string) {
  if (!cloudEnabled || !supabase) throw mediaError('Photo uploads require a configured private cloud account.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw mediaError('Sign in before uploading or deleting private photos.');
  if (data.user.id !== expectedUserId) throw mediaError('Your account changed. Please reload and try again.');
  return data.user.id;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(mediaError('Your browser could not compress this image.'))), type, quality);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(mediaError('This image could not be read. Please choose a JPEG, PNG, or WebP file.'));
    };
    image.src = url;
  });
}

/**
 * Resize and encode an image in the browser. Nothing is uploaded until this
 * promise resolves. Images are kept below the Storage bucket's 5 MiB cap.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw mediaError('Choose a JPEG, PNG, or WebP image.');
  }
  if (!file.size) throw mediaError('The selected image is empty.');
  if (file.size > MAX_SOURCE_BYTES) throw mediaError('Choose an image smaller than 16 MiB before compression.');

  const image = await loadImage(file);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const baseScale = Math.min(1, MAX_DIMENSION / largestSide);
  const baseWidth = Math.max(1, Math.round(image.naturalWidth * baseScale));
  const baseHeight = Math.max(1, Math.round(image.naturalHeight * baseScale));
  const attempts = [
    { scale: 1, quality: 0.82 },
    { scale: 0.9, quality: 0.76 },
    { scale: 0.8, quality: 0.7 },
    { scale: 0.7, quality: 0.62 },
  ];

  let output: Blob | undefined;
  for (const attempt of attempts) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(baseWidth * attempt.scale));
    canvas.height = Math.max(1, Math.round(baseHeight * attempt.scale));
    const context = canvas.getContext('2d');
    if (!context) throw mediaError('Your browser does not support image compression.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    output = await canvasBlob(canvas, 'image/webp', attempt.quality);
    if (output.size <= MAX_IMAGE_BYTES) break;
  }

  if (!output || output.size > MAX_IMAGE_BYTES) {
    throw mediaError('This image is still too large after compression. Try a smaller image.');
  }

  // Browsers that cannot encode WebP fall back to PNG; the bucket accepts both.
  const type = output.type === 'image/png' ? 'image/png' : 'image/webp';
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) || 'photo';
  return {
    file: new File([output], `${stem}.${extensionFor(type)}`, { type }),
    originalBytes: file.size,
    width: baseWidth,
    height: baseHeight,
  };
}

/** Upload a compressed image to the currently signed-in user's private prefix. */
export async function uploadPrivateImage(userId: string, file: File, kind: MediaKind): Promise<string> {
  const ownerId = await activeUserId(userId);
  if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
    throw mediaError('The compressed image is not valid for private storage.');
  }
  const path = `${ownerId}/${kind}/${randomId()}.${extensionFor(file.type)}`;
  const { error } = await supabase!.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw mediaError(error.message);
  return path;
}

/** Generate a short-lived URL; the object path, not this URL, is persisted in user JSON. */
export async function getPrivateImageUrl(userId: string, path: string, expiresIn = 60 * 60): Promise<string> {
  if (!supabase || !ownPath(userId, path)) throw mediaError('This private image does not belong to the current account.');
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw mediaError(error?.message ?? 'Could not create a private image URL.');
  return data.signedUrl;
}

/** Delete a current-user object. Server RLS remains the final authorization check. */
export async function deletePrivateImage(userId: string, path: string): Promise<void> {
  const ownerId = await activeUserId(userId);
  if (!ownPath(ownerId, path)) throw mediaError('This private image does not belong to the current account.');
  const { error } = await supabase!.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw mediaError(error.message);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
