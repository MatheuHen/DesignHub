import { useEffect, useRef, useState } from 'react';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

interface FilePreviewPickerProps {
  id: string;
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
}

/**
 * Preview antes do envio (item 1 da rodada de correções): JPG/PNG mostram a
 * imagem real; PDF mostra identificação clara + "Visualizar" (blob local,
 * nada é enviado ao servidor só por selecionar). Permite trocar/remover o
 * arquivo antes de confirmar o envio real do formulário.
 */
export function FilePreviewPicker({ id, label, accept, file, onChange, required }: FilePreviewPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
  }

  function handleRemover() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="file-preview-picker">
      <label htmlFor={id}>{label}</label>

      {!file && (
        <input id={id} ref={inputRef} type="file" accept={accept} onChange={handleInputChange} required={required} />
      )}

      {file && (
        <div className="file-preview-picker-selected">
          {IMAGE_TYPES.has(file.type) && previewUrl ? (
            <img src={previewUrl} alt={`Pré-visualização de ${file.name}`} className="file-preview-picker-image" />
          ) : (
            <p>Arquivo PDF selecionado: {file.name}</p>
          )}

          <div className="file-preview-picker-actions">
            {!IMAGE_TYPES.has(file.type) && previewUrl && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                Visualizar
              </a>
            )}
            <button type="button" onClick={() => inputRef.current?.click()}>
              Trocar arquivo
            </button>
            <button type="button" onClick={handleRemover}>
              Remover
            </button>
          </div>

          <input
            id={id}
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="sr-only"
          />
        </div>
      )}
    </div>
  );
}
