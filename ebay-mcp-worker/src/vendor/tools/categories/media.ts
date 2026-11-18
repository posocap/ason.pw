import {
  createImageFromUrlInputSchema,
  createDocumentInputSchema,
  createDocumentFromUrlInputSchema,
  documentIdInputSchema,
  uploadDocumentInputSchema,
  uploadPostOrderDocumentInputSchema,
} from '@/schemas/inventory-management/mediaDocuments.js';
import {
  attachMediaInputSchema,
  attachMediaOutputSchema,
  uploadImagesInputSchema,
  uploadImagesOutputSchema,
  uploadVideoInputSchema,
  videoIdInputSchema,
  videoOutputSchema,
} from '@/schemas/inventory-management/media.js';
import { defineTool } from '@/tools/defineTool.js';
import type { ToolEntry } from '@/tools/registry.js';
import type { OutputArgs } from '@/tools/types.js';
import { Effect } from 'effect';
import { zodToJsonSchema } from 'zod-to-json-schema';

const toMilliseconds = (seconds: number | undefined): number | undefined =>
  seconds === undefined ? undefined : seconds * 1000;

/**
 * Media tools. These are the only tools that read the local filesystem, and the
 * attach tool is the one deliberate composite (read item → upload → rewrite media
 * fields); both are documented exceptions to the one-endpoint-per-tool rule.
 */
export const mediaEntries: ToolEntry[] = [
  defineTool({
    name: 'ebay_create_image_from_url',
    description:
      'Create an EPS image from an HTTPS URL. Returns imageId, Location and the complete image payload, including EPS URLs. Requires sell.inventory.',
    inputSchema: createImageFromUrlInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: (api, args) => Effect.runPromise(api.media.createImageFromUrl(args)),
  }),
  defineTool({
    name: 'ebay_create_document',
    description:
      'Stage a listing document with documentType and languages. Returns documentId for ebay_upload_document. Requires sell.inventory.',
    inputSchema: createDocumentInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: (api, args) => Effect.runPromise(api.media.createDocument(args)),
  }),
  defineTool({
    name: 'ebay_create_document_from_url',
    description:
      'Create a listing document from an HTTPS URL: PDF, JPEG/JPG or PNG up to 10 MiB. Check ebay_get_document for ACCEPTED before attaching it to a listing. Requires sell.inventory.',
    inputSchema: createDocumentFromUrlInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: (api, args) => Effect.runPromise(api.media.createDocumentFromUrl(args)),
  }),
  defineTool({
    name: 'ebay_get_document',
    description:
      'Get listing document metadata and processing status. Only ACCEPTED documents may be attached to listings. Does not download document bytes. Requires sell.inventory.',
    inputSchema: documentIdInputSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.media.getDocument(args)),
  }),
  defineTool({
    name: 'ebay_download_post_order_document',
    description:
      'Download a post-order document as an embedded PDF resource. SUBMITTED documents are owner-only; PUBLISHED documents require authorization in the post-order flow. Expired documents are unavailable. Requires commerce.post_order.document.',
    inputSchema: documentIdInputSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.media.downloadPostOrderDocument(args)),
    formatResult: (bytes, args) => ({
      content: [
        { type: 'text', text: `Post-order document ${args.documentId} (${bytes.length} bytes)` },
        {
          type: 'resource',
          resource: {
            uri: `ebay-media://post-order/document/${encodeURIComponent(args.documentId)}`,
            mimeType: 'application/pdf',
            blob: bytes.toString('base64'),
          },
        },
      ],
    }),
  }),
  defineTool({
    name: 'ebay_remove_post_order_document',
    description:
      'Delete a SUBMITTED post-order document. PUBLISHED documents cannot be deleted; eBay enforces state and access restrictions. Requires commerce.post_order.document.',
    inputSchema: documentIdInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true },
    handler: (api, args) => Effect.runPromise(api.media.removePostOrderDocument(args)),
  }),

  defineTool({
    name: 'ebay_get_video',
    description:
      'Get a Media API video by ID: processing status (PENDING_UPLOAD, PROCESSING, LIVE, BLOCKED, PROCESSING_FAILED), statusMessage, expiry, and playlists. Use it to re-check a video that was still PROCESSING after ebay_upload_video.',
    inputSchema: videoIdInputSchema.shape,
    outputSchema: zodToJsonSchema(videoOutputSchema, {
      name: 'GetVideoResponse',
      $refStrategy: 'none',
    }) as OutputArgs,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.media.getVideo(args)),
  }),
];
