import { blocos, nomeArquivoModelo, trechos } from './modelos';

/**
 * Gera o arquivo Word (.docx) do documento já preenchido: Times New Roman 12, margens de peça forense (3 cm à esquerda e em cima, 2 cm à direita e embaixo),
 * texto justificado com recuo e espaçamento 1,5, rodapé com o número da página. Carrega a biblioteca só na hora de baixar.
 */
export async function gerarDocx(titulo: string, texto: string, opcoes: { rodape?: string } = {}): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, Document, Footer, Packer, PageBreak, Paragraph, PageNumber, TextRun, LineRuleType } = d;
  const FONTE = 'Times New Roman', TAM = 24;                                     // 12 pt (meio-ponto)
  const cm = (v: number) => Math.round(v * 567);
  const runs = (linha: string, negritoTodo = false, tam = TAM) => trechos(linha).map(t => new TextRun({
    text: t.texto, bold: negritoTodo || t.negrito, font: FONTE, size: tam, ...(t.preencher ? { highlight: 'yellow' as const } : {}),
  }));
  const corpo: InstanceType<typeof Paragraph>[] = [];
  for (const b of blocos(texto)) {
    switch (b.tipo) {
      case 'titulo': corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: runs(b.texto, true, 28) })); break;
      case 'secao': corpo.push(new Paragraph({ spacing: { before: 240, after: 120, line: 360, lineRule: LineRuleType.AUTO }, keepNext: true, children: runs(b.texto, true) })); break;
      case 'centro': corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: runs(b.texto) })); break;
      case 'direita': corpo.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: runs(b.texto) })); break;
      case 'semrecuo': corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: runs(b.texto) })); break;
      case 'item': corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, bullet: { level: 0 }, spacing: { after: 80, line: 360, lineRule: LineRuleType.AUTO }, children: runs(b.texto) })); break;
      case 'quebra': corpo.push(new Paragraph({ children: [new PageBreak()] })); break;
      case 'vazio': break;
      default: corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: cm(1.25) }, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: runs(b.texto) }));
    }
  }
  const doc = new Document({
    creator: 'GE Advocacia', title: titulo, description: 'Modelo preenchido — revisar antes de protocolar',
    styles: { default: { document: { run: { font: FONTE, size: TAM } } } },
    sections: [{
      properties: { page: { margin: { top: cm(3), left: cm(3), right: cm(2), bottom: cm(2) } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: `${opcoes.rodape ? `${opcoes.rodape} · ` : ''}Página `, font: FONTE, size: 18, color: '666666' }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: 18, color: '666666' }),
        new TextRun({ text: ' de ', font: FONTE, size: 18, color: '666666' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTE, size: 18, color: '666666' }),
      ] })] }) },
      children: corpo,
    }],
  });
  return Packer.toBlob(doc);
}

/** Baixa o .docx (cria um link temporário; nada é enviado a servidor algum). */
export async function baixarDocx(titulo: string, texto: string, rodape?: string) {
  const blob = await gerarDocx(titulo, texto, { rodape });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivoModelo(titulo, 'docx');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
