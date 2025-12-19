export class ImageUtils {
  static imageToDataURL(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
  }

  static async convertFileToBase64DataURL(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageBase64 = buffer.toString('base64');
    return this.imageToDataURL(imageBase64, file.type);
  }

  static isValidImageType(file: File): boolean {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    return validTypes.includes(file.type);
  }

  static isValidImageSize(file: File, maxSizeMB: number = 5): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }
}
