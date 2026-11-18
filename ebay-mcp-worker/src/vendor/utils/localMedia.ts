// Workers port: local-file media loading was removed (Workers have no filesystem).
// Only the type survives because the (URL-driven) media API modules still reference it.
export type LocalMediaKind = 'image' | 'video' | 'document' | 'postOrderDocument' | 'feedFile';

export interface LocalMediaFile {
  readonly source: string;
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly kind: LocalMediaKind;
  readonly bytes: Uint8Array;
}
