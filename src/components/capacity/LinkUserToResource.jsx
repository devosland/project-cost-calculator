/**
 * Inline dropdown to link (or unlink) a resource to a user account. Rendered
 * as a single `<select>` inside the "Linked user" column of ResourcePool.
 *
 * Decision 9 (spec §2): only the resource pool owner can change the link.
 * The `readOnly` prop renders the email as plain text when the caller is a
 * viewer. This component does not enforce the permission itself — the server
 * returns 403 on unauthorised writes; the prop just avoids dangling dropdowns
 * that would fail silently on save.
 *
 * Candidate list semantics:
 *   - `candidates` is the output of `GET /capacity/share-candidates`.
 *   - An option marked `linked_resource_id` with a value other than the
 *     current resource is still shown but disabled, with an inline hint
 *     ("already linked to …") so the user understands why they cannot pick it.
 *   - The currently-linked user is always included even if the share has since
 *     been revoked (so the row displays correctly).
 */
import React, { useState } from 'react';
import { useLocale } from '../../lib/i18n';

/**
 * @param {object} props
 * @param {object} props.resource              - Full resource row (expects `id`, `linked_user_id`, `linked_user_email`).
 * @param {Array}  props.candidates            - Share-candidate list (may be empty until the dropdown opens).
 * @param {(id: number|null) => Promise<void>} props.onLink - Called with the selected user id (or null to unlink).
 * @param {boolean} [props.readOnly]           - Render as static text when the caller cannot edit.
 */
export default function LinkUserToResource({ resource, candidates, onLink, readOnly = false }) {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (readOnly) {
    return (
      <span className="text-sm text-muted-foreground">
        {resource.linked_user_email || '—'}
      </span>
    );
  }

  async function handleChange(e) {
    setError(null);
    const raw = e.target.value;
    const next = raw === '' ? null : Number(raw);
    try {
      setSaving(true);
      await onLink(next);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('already_linked')) setError(t('capacity.userAlreadyLinked'));
      else if (msg.includes('invalid_user')) setError(t('capacity.invalidUser'));
      else setError(t('capacity.linkFailed'));
    } finally {
      setSaving(false);
    }
  }

  const currentValue = resource.linked_user_id ?? '';

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={currentValue}
        onChange={handleChange}
        disabled={saving}
        className="input-field text-sm"
        aria-label={t('capacity.linkedUser')}
      >
        <option value="">{t('capacity.notLinked')}</option>
        {candidates.map((c) => {
          const otherlyTaken = c.linked_resource_id && c.linked_resource_id !== resource.id;
          return (
            <option
              key={c.id}
              value={c.id}
              disabled={!!otherlyTaken}
              title={otherlyTaken ? t('capacity.userAlreadyLinked') : undefined}
            >
              {c.name || c.email}
              {otherlyTaken ? ` (${t('capacity.alreadyLinkedShort')})` : ''}
            </option>
          );
        })}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
