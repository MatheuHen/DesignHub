import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FilePreviewPicker } from './FilePreviewPicker';

function Wrapper() {
  const [file, setFile] = useState<File | null>(null);
  return <FilePreviewPicker id="arquivo-teste" label="Arquivo" accept="application/pdf,image/jpeg,image/png" file={file} onChange={setFile} />;
}

describe('FilePreviewPicker (item 1 — preview antes do envio)', () => {
  it('mostra preview real da imagem quando um JPG/PNG é selecionado', () => {
    render(<Wrapper />);

    const image = new File(['conteudo'], 'arte.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [image] } });

    const preview = screen.getByAltText('Pré-visualização de arte.png');
    expect(preview).toBeInTheDocument();
    expect(preview.tagName).toBe('IMG');
  });

  it('identifica claramente um PDF selecionado, sem mostrar só o nome cru como imagem', () => {
    render(<Wrapper />);

    const pdf = new File(['%PDF-1.4'], 'referencia.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [pdf] } });

    expect(screen.getByText('Arquivo PDF selecionado: referencia.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visualizar' })).toBeInTheDocument();
  });

  it('permite remover o arquivo selecionado antes de confirmar o envio', () => {
    render(<Wrapper />);

    const image = new File(['conteudo'], 'arte.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [image] } });
    expect(screen.getByAltText('Pré-visualização de arte.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByAltText('Pré-visualização de arte.png')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Arquivo')).toBeInTheDocument();
  });

  it('permite trocar o arquivo antes de confirmar o envio (reabre o seletor)', () => {
    render(<Wrapper />);

    const image = new File(['conteudo'], 'arte.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [image] } });

    expect(screen.getByRole('button', { name: 'Trocar arquivo' })).toBeInTheDocument();
  });
});
