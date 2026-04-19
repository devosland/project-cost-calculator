/**
 * Modal for saving the current project as a reusable template and loading
 * existing templates as new projects. Two-tab layout: Save (name input) and
 * Load (template list with use/delete actions). Templates are stored server-side
 * and managed via App handlers; this component is purely presentational.
 */
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { X, Trash2, Save, FolderOpen } from 'lucide-react';
import { useLocale, getDateLocale } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

/**
 * @param {Object} props
 * @param {boolean} props.open - Whether the modal is visible.
 * @param {function(): void} props.onClose - Close the modal.
 * @param {Array<{id: string, name: string, created_at: string, data: Object}>} props.templates
 *   Saved templates list.
 * @param {function(string): void} props.onSaveTemplate - Save current project as
 *   template with the given name.
 * @param {function(Object): void} props.onLoadTemplate - Create a new project from
 *   the selected template object.
 * @param {function(string): void} props.onDeleteTemplate - Delete a template by ID.
 * @param {Object|null} props.currentProject - Active project; used to prefill the
 *   template name with "{projectName} - Template".
 */
const TemplateManager = ({ open, onClose, templates, onSaveTemplate, onLoadTemplate, onDeleteTemplate, currentProject }) => {
  const { t, locale } = useLocale();
  const [activeTab, setActiveTab] = useState('save');
  const [templateName, setTemplateName] = useState('');
  const trapRef = useFocusTrap(open);

  // Escape to close. Listener only registered while the modal is open to
  // avoid interfering with other keyboard handlers when closed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const defaultName = currentProject?.name ? `${currentProject.name} - ${t('templates.defaultName')}` : t('templates.defaultName');

  const handleSave = () => {
    const name = templateName.trim() || defaultName;
    onSaveTemplate(name);
    setTemplateName('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-manager-title"
        tabIndex={-1}
        className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="template-manager-title" className="font-display text-xl font-semibold tracking-tight">
            {t('templates.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('nonLabour.cancel')}
            className="p-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'save'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/70'
            }`}
            onClick={() => setActiveTab('save')}
          >
            <Save className="w-4 h-4" />
            {t('templates.save')}
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'load'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/70'
            }`}
            onClick={() => setActiveTab('load')}
          >
            <FolderOpen className="w-4 h-4" />
            {t('templates.load')}
          </button>
        </div>

        {/* Save Tab */}
        {activeTab === 'save' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('templates.templateName')}</label>
              <input
                type="text"
                className="input-field w-full"
                placeholder={defaultName}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <Button variant="default" size="default" className="w-full" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              {t('templates.saveAsTemplate')}
            </Button>
          </div>
        )}

        {/* Load Tab */}
        {activeTab === 'load' && (
          <div className="space-y-3">
            {(!templates || templates.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('templates.noTemplates')}
              </p>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-md border border-border bg-background"
                >
                  <div>
                    <p className="font-medium text-sm">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(template.created_at).toLocaleDateString(getDateLocale(locale))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onLoadTemplate(template)}
                    >
                      {t('templates.use')}
                    </Button>
                    <button
                      onClick={() => onDeleteTemplate(template.id)}
                      title={t('resources.delete')}
                      aria-label={t('resources.delete')}
                      className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;
