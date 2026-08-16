# DesignHub — Ordem de precedência documental

Use esta pasta como fonte local de evidencia e respeite rigorosamente a ordem de precedencia documental definida neste arquivo.

## Ordem congelada

1. `01_Roteiro_Correcoes_Pendentes_TFC_DesignHub.docx` + correções/diagramas consolidados mais recentes.
2. Diagramas corrigidos apresentados em `diagramas-extraidos/` quando correspondentes ao documento consolidado.
3. `02_TFC1_BASE_104_PAGINAS.pdf` como baseline histórica do TFC I.
4. `03_TFC1_CORRECOES_CONSOLIDADAS.pdf` como copia de trabalho que incorpora correcoes posteriores; em caso de divergencia, prevalece a fonte de maior precedencia documental.
5. Material antigo serve apenas como histórico e nunca reintroduz requisito superado.

## Regras

- Não escolher requisito por "versão que parece melhor".
- Não criar requisito para resolver lacuna de implementação.
- Não alterar stack principal documentada.
- Não usar diagrama antigo com numeração/nomes superados para reverter correções.
- Se uma divergência não estiver resolvida pela precedência, registrar `CONFLITO_DOCUMENTAL` e preservar o fluxo atual até decisão humana; continuar todo trabalho independente.
