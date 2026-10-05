// Reusable attachment preview (lightbox) for compliance documents.
//
// Why: NPO applications, leave requests and safety photos all attach files, but
// both apps could only render a thumbnail or an external <a href>. A reviewer had
// to leave the app to look at an attachment. This opens it in place: images get a
// zoomable full-screen view, PDFs and everything else open in an embedded frame
// with a download/open fallback if the browser refuses to render them.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ExternalLink, FileText, Maximize2, TriangleAlert, X } from 'lucide-react';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i;

function isImageUrl(url: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true;
  return IMAGE_RE.test(url);
}

function isPdfUrl(url: string, mimeType?: string): boolean {
  if (mimeType === 'application/pdf') return true;
  return /\.pdf(\?|#|$)/i.test(url);
}

/**
 * A tappable attachment row: shows the file name, opens the preview on click.
 * Drop-in replacement for the bare <a href target="_blank"> links used previously.
 */
export function AttachmentButton({
  url, fileName, mimeType,
}: {
  url: string;
  fileName: string;
  mimeType?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-blue-600 underline flex items-center gap-1 text-left hover:text-blue-800"
        title="Preview attachment"
      >
        <FileText className="h-3 w-3 shrink-0" />
        {fileName}
        <Maximize2 className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      <AttachmentViewer open={open} onClose={() => setOpen(false)} url={url} fileName={fileName} mimeType={mimeType} />
    </>
  );
}

/** Full-screen preview for one attachment. */
export function AttachmentViewer({
  open, onClose, url, fileName, mimeType,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
  mimeType?: string;
}) {
  // Remount-per-attachment: a key of `${url}|${open}` clears the failed flag
  // when a different document is previewed, without a setState-in-effect.
  const [failed, setFailed] = useState(false);
  const image = isImageUrl(url, mimeType);
  const pdf = isPdfUrl(url, mimeType);

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          {failed ? (
            <div className="text-center p-8 text-sm text-slate-500 space-y-2">
              <TriangleAlert className="h-8 w-8 mx-auto opacity-40" />
              <p>This attachment could not be displayed inline.</p>
              <p className="text-xs break-all font-mono">{url}</p>
            </div>
          ) : image ? (
            <img src={url} alt={fileName} onError={() => setFailed(true)} className="max-w-full max-h-[65vh] object-contain" />
          ) : pdf ? (
            <iframe src={url} title={fileName} onError={() => setFailed(true)} className="w-full h-[65vh] rounded-md bg-white" />
          ) : (
            <div className="text-center p-8 text-sm text-slate-500 space-y-2">
              <FileText className="h-8 w-8 mx-auto opacity-40" />
              <p>No inline preview for this file type.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="default">
              <ExternalLink className="h-4 w-4 mr-1" /> Open in new tab
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Vertical list of attachments with preview buttons. */
export function AttachmentList({
  documents, emptyMessage = 'No documents attached.',
}: {
  documents: { url: string; fileName: string; mimeType?: string }[];
  emptyMessage?: string;
}) {
  if (!documents || documents.length === 0) {
    return <p className="text-amber-600">{emptyMessage}</p>;
  }
  return (
    <ul className="mt-1 space-y-1">
      {documents.map((d, i) => (
        <li key={`${d.url}-${i}`}>
          <AttachmentButton url={d.url} fileName={d.fileName} mimeType={d.mimeType} />
        </li>
      ))}
    </ul>
  );
}