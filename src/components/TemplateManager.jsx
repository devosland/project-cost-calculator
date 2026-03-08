import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { X, Trash2, Save, FolderOpen } from 'lucide-react';

const TemplateManager = ({ open, onClose, templates, onSaveTemplate, onLoadTemplate, onDeleteTemplate, currentProject }) => {
  const [activeTab, setActiveTab] = useState('save');
  const [templateName, setTemplateName] = useState('');

  if (!open) return null;

  const defaultName = currentProject?.name ? `${currentProject.name} - Modèle` : 'Modèle';

  const handleSave = () => {
    const name = templateName.trim() || defaultName;
    onSaveTemplate(name);
    setTemplateName('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Gestion des modèles</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'save'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('save')}
          >
            <Save className="w-4 h-4" />
            Sauvegarder
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'load'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('load')}
          >
            <FolderOpen className="w-4 h-4" />
            Charger
          </button>
        </div>

        {/* Save Tab */}
        {activeTab === 'save' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Nom du modèle</label>
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
              Sauvegarder comme modèle
            </Button>
          </div>
        )}

        {/* Load Tab */}
        {activeTab === 'load' && (
          <div className="space-y-3">
            {(!templates || templates.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucun modèle sauvegardé.
              </p>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <p className="font-medium text-sm">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(template.created_at).toLocaleDateString('fr-CA')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onLoadTemplate(template)}
                    >
                      Utiliser
                    </Button>
                    <button
                      onClick={() => onDeleteTemplate(template.id)}
                      className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
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
