type PhotoSize = { width: number; height: number };

export function fitPhotoSize(source: PhotoSize, box: PhotoSize): PhotoSize {
  const dimensions = [source.width, source.height, box.width, box.height];
  if (
    !dimensions.every(
      (dimension) => Number.isFinite(dimension) && dimension > 0,
    )
  ) {
    throw new RangeError(
      'Dimensões da foto e da caixa devem ser finitas e positivas.',
    );
  }

  const scale = Math.min(box.width / source.width, box.height / source.height);
  return { width: source.width * scale, height: source.height * scale };
}

export function pairPhotos<T>(photos: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < photos.length; index += 2) {
    rows.push(photos.slice(index, index + 2));
  }
  return rows;
}
