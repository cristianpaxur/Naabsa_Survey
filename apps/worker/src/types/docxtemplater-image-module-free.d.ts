declare module 'docxtemplater-image-module-free' {
  interface ImageModuleOptions {
    centered?: boolean;
    fileType?: 'docx' | 'pptx';
    getImage: (tagValue: unknown, tagName: string) => Buffer;
    getSize: (
      image: Buffer,
      tagValue: unknown,
      tagName: string,
    ) => [number, number];
  }

  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
