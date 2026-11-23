import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { restartDraftSurveyPageNumbers } from './docx-page-numbering';

const section =
  '<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:headerReference w:type="first" r:id="cover"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="284" w:bottom="284"/><w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>';
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const manual = paragraph('Texto revisado pelo operador — não reconstruir.');
function fixture(title = 'Draft Survey', customSections = false) {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document><w:body>${paragraph(title)}${paragraph('Contents')}${paragraph('1. Background')}${customSections ? `<w:p><w:pPr>${section}</w:pPr></w:p>` : '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>'}<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:bookmarkStart w:id="1" w:name="s1"/><w:r><w:t>Background</w:t></w:r></w:p>${manual}${section}</w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="footer" Type="footer" Target="footer1.xml"/></Relationships>',
  );
  zip.file('[Content_Types].xml', '<Types/>'.replace('/>', '></Types>'));
  zip.file(
    'word/footer1.xml',
    '<w:ftr><w:p><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>',
  );
  zip.file('word/media/manual.png', Buffer.from([1, 4, 7, 9]));
  return zip.generate({ type: 'nodebuffer' });
}

describe('numeração após Contents no Draft Survey', () => {
  it('preserva o corpo editado, fotos e rodapé do corpo ao criar a seção inicial', () => {
    const original = fixture();
    const before = new PizZip(original);
    const after = new PizZip(restartDraftSurveyPageNumbers(original));
    const xml = after.file('word/document.xml')!.asText();
    const sections = xml.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g)!;
    expect(sections).toHaveLength(2);
    expect(xml).toContain(manual);
    expect(xml.indexOf(sections[0]!)).toBeLessThan(xml.indexOf('w:name="s1"'));
    expect(sections[0]).toContain('<w:titlePg/>');
    expect(sections[0]).not.toContain('r:id="footer"');
    expect(sections[1]).toContain('<w:pgNumType w:start="1"/>');
    expect(sections[1]).toContain('<w:type w:val="nextPage"/>');
    expect(sections[1]).toContain('r:id="footer"');
    expect(sections[1]).not.toContain('<w:titlePg');
    for (const s of sections) {
      expect(s).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
      expect(s).toContain('<w:pgMar w:top="284" w:bottom="284"/>');
      expect(s).toContain('r:id="header"');
    }
    for (const part of ['word/footer1.xml', 'word/media/manual.png']) {
      expect(after.file(part)!.asNodeBuffer()).toEqual(
        before.file(part)!.asNodeBuffer(),
      );
    }
  });
  it('reabrir um documento já adaptado mantém exatamente os mesmos bytes', () => {
    const converted = restartDraftSurveyPageNumbers(fixture());
    expect(restartDraftSurveyPageNumbers(converted)).toBe(converted);
  });
  it('substitui a quebra de página do gerador antigo pela quebra de seção', () => {
    const original = new PizZip(fixture());
    original.file(
      'word/document.xml',
      original
        .file('word/document.xml')!
        .asText()
        .replace(
          '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>',
          '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
        ),
    );
    const updated = new PizZip(
      restartDraftSurveyPageNumbers(original.generate({ type: 'nodebuffer' })),
    );
    const xml = updated.file('word/document.xml')!.asText();
    expect(xml.slice(0, xml.indexOf('w:name="s1"'))).not.toContain(
      '<w:br w:type="page"/>',
    );
    expect(xml).toContain(manual);
  });
  it('mantém contatos, bordas e links do rodapé inicial e remove somente PAGE', () => {
    const original = new PizZip(fixture());
    const footer =
      '<w:ftr><w:p><w:pPr><w:pBdr><w:top/></w:pBdr></w:pPr><w:hyperlink r:id="mail"><w:r><w:t>surveyors@naabsa.com.br</w:t></w:r></w:hyperlink><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE \\* MERGEFORMAT</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>6</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
    original.file('word/footer1.xml', footer);
    original.file(
      'word/_rels/footer1.xml.rels',
      '<Relationships><Relationship Id="mail" Target="mailto:surveyors@naabsa.com.br" TargetMode="External"/></Relationships>',
    );
    const updated = new PizZip(
      restartDraftSurveyPageNumbers(original.generate({ type: 'nodebuffer' })),
    );
    const frontFooter = updated.file('word/naabsa-front-footer1.xml')!.asText();
    expect(frontFooter).toContain('surveyors@naabsa.com.br');
    expect(frontFooter).toContain('<w:top/>');
    expect(frontFooter).not.toMatch(/PAGE|<w:t>6<\/w:t>/);
    expect(updated.file('word/footer1.xml')!.asText()).toBe(footer);
    expect(
      updated.file('word/_rels/naabsa-front-footer1.xml.rels')!.asText(),
    ).toBe(original.file('word/_rels/footer1.xml.rels')!.asText());
  });
  it('preserva documentos de outros tipos', () => {
    const original = fixture('Marine Survey Certificate');
    expect(restartDraftSurveyPageNumbers(original)).toBe(original);
  });
  it('preserva seções personalizadas pelo operador', () => {
    const original = fixture('Draft Survey', true);
    expect(restartDraftSurveyPageNumbers(original)).toBe(original);
  });
  it('não sobrescreve partes ou relacionamentos com o nome escolhido', () => {
    const original = new PizZip(fixture());
    original.file(
      'word/naabsa-front-footer1.xml',
      'preservar rodapé existente',
    );
    const updated = new PizZip(
      restartDraftSurveyPageNumbers(original.generate({ type: 'nodebuffer' })),
    );
    expect(updated.file('word/naabsa-front-footer1.xml')!.asText()).toBe(
      'preservar rodapé existente',
    );
    expect(
      updated.file('word/naabsa-front-footer2.xml')!.asText(),
    ).not.toContain('w:instr="PAGE"');
  });
});
