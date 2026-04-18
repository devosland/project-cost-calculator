/**
 * Top-bar badge reflecting the current auto-save state. Three states:
 *   - idle   → renders nothing (hidden when no save is in flight or recent)
 *   - saving → spinning loader + "Enregistrement…" text
 *   - saved  → green check + "Enregistré" text, fades out after 2 seconds
 *   - error  → red alert icon + error text (persists until next save attempt)
 *
 * The fade-out on 'saved' is implemented via opacity transition on a timer
 * rather than unmounting, to avoid a flash on the next save cycle.
 */
import { useState, useEffect } from 'react'
import { Check, AlertCircle, Loader2 } from 'lucide-react'
import { useLocale } from '../lib/i18n'

/**
 * @param {Object} props
 * @param {'idle'|'saving'|'saved'|'error'} props.status - Current save state
 *   driven by App's debounced saveToApi; transitions: idle → saving → saved|error.
 */
function SaveIndicator({ status }) {
  const { t } = useLocale();
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (status === 'saved') {
      setOpacity(1);
      const timer = setTimeout(() => {
        setOpacity(0);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setOpacity(1);
    }
  }, [status]);

  if (status === 'idle') return null;

  return (
    <div
      className="flex items-center gap-1.5 transition-opacity duration-500"
      style={{ opacity }}
    >
      {status === 'saving' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('save.saving')}</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="w-3 h-3 text-emerald-500" />
          <span className="text-xs text-emerald-500">{t('save.saved')}</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span className="text-xs text-destructive">{t('save.error')}</span>
        </>
      )}
    </div>
  );
}

export default SaveIndicator
