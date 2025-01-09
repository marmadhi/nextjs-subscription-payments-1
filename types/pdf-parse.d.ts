declare module 'pdf-parse' {
  interface PDFOptions {
    pagerender?: (pageData: any) => string;
    max?: number;
    version?: string;
  }

  function pdf(
    dataBuffer: Buffer,
    options?: PDFOptions
  ): Promise<{
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
  }>;

  export default pdf;
} 