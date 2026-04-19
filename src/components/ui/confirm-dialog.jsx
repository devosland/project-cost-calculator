/**
 * ConfirmDialog — convenience wrapper around the AlertDialog primitives for
 * the common "confirm destructive action" pattern. Handles open-state
 * declaratively via props and exposes a single onConfirm callback.
 *
 * Preferred entry point for replacing native `confirm()` calls, which are
 * blocked on many mobile browsers and cannot be styled to match the app.
 *
 * Usage :
 *   const [pending, setPending] = useState(null);
 *   ...
 *   <Button onClick={() => setPending(item)}>Delete</Button>
 *   <ConfirmDialog
 *     open={!!pending}
 *     onOpenChange={(open) => { if (!open) setPending(null); }}
 *     title="Delete resource?"
 *     description="This action cannot be undone."
 *     confirmLabel="Delete"
 *     destructive
 *     onConfirm={() => { handleDelete(pending); setPending(null); }}
 *   />
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {string} [props.confirmLabel='Confirm']
 * @param {string} [props.cancelLabel='Cancel']
 * @param {boolean} [props.destructive=false] - Styles confirm as destructive (red).
 * @param {() => void} props.onConfirm - Fired when the user clicks the confirm button.
 *   The dialog auto-closes via Radix's default behavior on AlertDialogAction.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
