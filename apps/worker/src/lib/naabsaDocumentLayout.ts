import {
  AlignmentType,
  BorderStyle,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from 'docx';

export const NAABSA_NAVY = '002060';
export const NAABSA_BODY_FONT = 'Tahoma';
export const NAABSA_HEADER_FONT = 'GeoSlab703 Md BT';

/**
 * Geometria A4 do relatorio (twips/DXA). As laterais e distancias de
 * cabecalho/rodape sao as do modelo. A area vertical permanece segura para as
 * quebras automaticas do gerador; o modelo usava margens minimas combinadas a
 * quebras manuais, que fariam o conteudo invadir o cabecalho no Collabora.
 */
export const NAABSA_PAGE_MARGINS = {
  top: 1_440,
  right: 851,
  bottom: 1_080,
  left: 794,
  header: 709,
  footer: 709,
} as const;

export const NAABSA_BODY_WIDTH = 10_261;
export const NAABSA_CONTACT_COLUMNS = [5_121, 5_140] as const;

type HeaderVariant = 'first' | 'default';

const headerRule = {
  style: BorderStyle.SINGLE,
  size: 2,
  color: NAABSA_NAVY,
  space: 0,
} as const;

/**
 * Reproduz o cabecalho do modelo aprovado sem tabelas. No original, o logo e
 * uma imagem flutuante ancorada no primeiro paragrafo; isso evita as grades de
 * tabela que o Collabora exibia na aplicacao.
 */
export function createNaabsaHeader(
  logo: Buffer | null,
  variant: HeaderVariant,
): Header {
  const firstPage = variant === 'first';
  const logoRun = logo
    ? new ImageRun({
        type: 'jpg',
        data: logo,
        transformation: firstPage
          ? { width: 136, height: 31.1 }
          : { width: 166.4, height: 38.05 },
        altText: {
          title: 'NAABSA',
          description: 'NAABSA',
          name: 'NAABSA logo',
        },
        floating: {
          horizontalPosition: firstPage
            ? {
                relative: HorizontalPositionRelativeFrom.MARGIN,
                align: HorizontalPositionAlign.LEFT,
              }
            : {
                relative: HorizontalPositionRelativeFrom.MARGIN,
                offset: 635,
              },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PARAGRAPH,
            offset: firstPage ? -1_965 : 12_146,
          },
          margins: {
            top: 0,
            bottom: firstPage ? 8_890 : 0,
            left: 114_300,
            right: 114_300,
          },
          wrap: { type: TextWrappingType.NONE },
          behindDocument: true,
          allowOverlap: true,
          layoutInCell: true,
          zIndex: firstPage ? 251_658_240 : 251_658_241,
        },
      })
    : null;

  const children = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0, line: 240 },
      border: { bottom: headerRule },
      children: [
        ...(logoRun ? [logoRun] : []),
        new TextRun({
          text: 'MARINE SURVEYORS & CONSULTANTS',
          font: NAABSA_HEADER_FONT,
          color: NAABSA_NAVY,
          size: 28,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0, line: 240 },
      border: { bottom: headerRule },
      children: [
        new TextRun({
          text: 'Main Brazilian Ports',
          font: NAABSA_HEADER_FONT,
          color: NAABSA_NAVY,
          size: 18,
        }),
      ],
    }),
  ];

  return new Header({
    children,
  });
}
