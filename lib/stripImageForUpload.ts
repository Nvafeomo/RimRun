import * as ImageManipulator from 'expo-image-manipulator';

/** Re-encode as JPEG via native pipeline to drop EXIF / location metadata before upload. */
export async function reencodeJpegWithoutExif(localUri: string): Promise<ArrayBuffer> {
  const result = await ImageManipulator.manipulateAsync(localUri, [], {
    compress: 0.92,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const res = await fetch(result.uri);
  return res.arrayBuffer();
}
