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
    // item 5.2 (correções 13/09/2026): texto de confirmação padronizado.
    expect(screen.getByText('Arquivo selecionado: arte.png')).toBeInTheDocument();
  });

  it('identifica claramente um PDF selecionado, sem mostrar só o nome cru como imagem', () => {
    render(<Wrapper />);

    const pdf = new File(['%PDF-1.4'], 'referencia.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [pdf] } });

    expect(screen.getByText('Arquivo selecionado: referencia.pdf')).toBeInTheDocument();
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

/**
 * Aviso de proporção: informativo e OPT-IN. Só aparece no envio da versão da
 * arte (o arquivo que a publicação automática manda para a Meta) e nunca
 * impede o envio — a arte continua sendo ajustada fora do DesignHub (RN15) e
 * o caminho manual do RF014 segue disponível.
 */
describe('FilePreviewPicker — aviso de proporção do Instagram', () => {
  function WrapperComAviso({ avisar }: { avisar: boolean }) {
    const [file, setFile] = useState<File | null>(null);
    return (
      <FilePreviewPicker
        id="arquivo-aviso"
        label="Arquivo"
        accept="image/png"
        file={file}
        onChange={setFile}
        avisarProporcaoInstagram={avisar}
      />
    );
  }

  /** jsdom não decodifica imagem: o onLoad é disparado com as dimensões simuladas. */
  function selecionarEDecodificar(largura: number, altura: number) {
    const image = new File(['conteudo'], 'arte.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [image] } });
    const preview = screen.getByAltText('Pré-visualização de arte.png');
    Object.defineProperty(preview, 'naturalWidth', { value: largura, configurable: true });
    Object.defineProperty(preview, 'naturalHeight', { value: altura, configurable: true });
    fireEvent.load(preview);
  }

  it('avisa quando a proporção é recusada pelo feed (caso real 360x106)', () => {
    render(<WrapperComAviso avisar />);
    selecionarEDecodificar(360, 106);

    expect(screen.getByRole('status')).toHaveTextContent(/360×106/);
    // Informativo, não erro: nada de role="alert" nem remoção do arquivo.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Arquivo selecionado: arte.png')).toBeInTheDocument();
  });

  it('não avisa quando a imagem está dentro dos limites', () => {
    render(<WrapperComAviso avisar />);
    selecionarEDecodificar(1080, 1080);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('não avisa quando o aviso não foi solicitado (ex.: comprovante)', () => {
    render(<WrapperComAviso avisar={false} />);
    selecionarEDecodificar(360, 106);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
