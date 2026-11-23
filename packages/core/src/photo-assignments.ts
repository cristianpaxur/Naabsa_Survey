export interface PhotoAssignment {
  id: string;
  slot_id: string | null;
  position: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  processed_path: string | null;
  status: string;
  ai_suggested: boolean;
}

/** Stable input for optimistic photo synchronization, independent of row order. */
export function serializePhotoAssignments(
  photos: readonly PhotoAssignment[],
): string {
  return JSON.stringify(
    [...photos]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((photo) => [
        photo.id,
        photo.slot_id,
        photo.position,
        photo.crop
          ? [photo.crop.x, photo.crop.y, photo.crop.width, photo.crop.height]
          : null,
        photo.processed_path,
        photo.status,
        photo.ai_suggested,
      ]),
  );
}
