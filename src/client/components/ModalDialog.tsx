import { useEffect, useId, useRef, type ReactNode } from 'react';

type ModalDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
};

export function ModalDialog({ open, onClose, title, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.setAttribute('closedby', 'any');

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Progressive fallback for browsers without native closedby="any" (modern-web-guidance)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    const hasNativeClosedBy =
      typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

    if (hasNativeClosedBy) {
      return () => {
        dialog.removeEventListener('close', handleClose);
      };
    }

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="finicky-dialog" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-[#e3d5bf]">
        <h2 id={titleId} className="finicky-title text-xl font-bold text-[#2b2118]">
          {title}
        </h2>
        <form method="dialog">
          <button
            type="submit"
            aria-label="Close dialog"
            className="touch-target inline-flex items-center justify-center rounded-xl border-2 border-[#2b2118] bg-[#faf4e8] px-3 py-1.5 text-sm font-bold text-[#2b2118] hover:bg-[#f2e8d5] cursor-pointer"
          >
            ✕
          </button>
        </form>
      </div>
      <div className="overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
