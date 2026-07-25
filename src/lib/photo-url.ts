// Signed URL helper — injectable for unit testing

export const PHOTO_URL_EXPIRES_IN = 600 as const; // 10분

type StorageBucket = {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
};

type InjectableStorage = {
  from(bucket: string): StorageBucket;
};

export type SignedUrlResult = {
  signedUrl: string;
  expiresAt: string; // ISO 8601
};

/**
 * Creates a 10-minute signed URL for a photo in the moments bucket.
 * Returns SignedUrlResult on success, error string on failure.
 * Injectable for unit testing.
 */
export async function createMomentSignedUrl(
  storage: InjectableStorage,
  storagePath: string,
  expiresIn: number = PHOTO_URL_EXPIRES_IN,
): Promise<SignedUrlResult | string> {
  const { data, error } = await storage.from("moments").createSignedUrl(storagePath, expiresIn);
  if (error) {
    return (error as { message?: string })?.message ?? "Signed URL creation failed";
  }
  if (!data?.signedUrl) return "Signed URL response missing";
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { signedUrl: data.signedUrl, expiresAt };
}
