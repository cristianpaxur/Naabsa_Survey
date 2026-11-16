"""Regression contracts for BQS's shared Naabsa document design."""
from pathlib import Path
from zipfile import ZipFile
import unittest
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[2]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'


class BqsLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bqs = ZipFile(ROOT / 'templates/bqs.v2.clean.docx')
        cls.msc = ZipFile(ROOT / 'templates/msc.clean.docx')
        cls.doc = E.fromstring(cls.bqs.read('word/document.xml'))
        cls.reference = E.fromstring(cls.msc.read('word/document.xml'))

    def test_contact_table_uses_reference_geometry_and_real_paragraphs(self):
        contact = self.doc.findall('w:body/w:tbl', NS)[1]
        reference = self.reference.findall('w:body/w:tbl', NS)[1]
        self.assertEqual(
            contact.xpath('w:tblGrid/w:gridCol/@w:w', namespaces=NS),
            reference.xpath('w:tblGrid/w:gridCol/@w:w', namespaces=NS),
        )
        self.assertEqual(len(contact.findall('w:tr', NS)), 4)
        for row in contact.findall('w:tr', NS):
            cells = row.findall('w:tc', NS)
            self.assertIsNotNone(cells[0].find('w:tcPr/w:tcBorders/w:right', NS))
            self.assertEqual(len(cells[1].findall('w:p', NS)), 2)
            self.assertIsNotNone(cells[1].find('w:p/w:r/w:rPr/w:b', NS))
            self.assertFalse(cells[1].findall('w:p', NS)[1].findall('w:r/w:rPr/w:b', NS))

    def test_shared_header_footer_and_typography(self):
        for target, source in [('naabsa-header1.xml', 'header1.xml'),
                               ('naabsa-header2.xml', 'header2.xml'),
                               ('naabsa-footer1.xml', 'footer1.xml')]:
            self.assertEqual(self.bqs.read('word/' + target), self.msc.read('word/' + source))
        title = self.doc.xpath('//w:p[w:r/w:t="Bunker Quantity Survey"]', namespaces=NS)[0]
        self.assertEqual(title.find('w:r/w:rPr/w:sz', NS).get(W + 'val'), '22')
        for mark in self.doc.xpath('//w:bookmarkStart[starts-with(@w:name,"bqs_s")]', namespaces=NS):
            p = mark.getparent()
            self.assertEqual(p.find('w:r/w:rPr/w:rFonts', NS).get(W + 'ascii'), 'Calibri')
        for section in self.doc.findall('.//w:sectPr', NS):
            self.assertEqual(section.find('w:pgMar', NS).get(W + 'top'), '1418')
            self.assertEqual(section.find('w:pgMar', NS).get(W + 'bottom'), '567')

    def test_real_reference_fonts_are_embedded(self):
        fonts = E.fromstring(self.bqs.read('word/fontTable.xml'))
        for name in ['Tahoma', 'Calibri', 'Times New Roman', 'Cambria', 'GeoSlab703 Md BT']:
            entry = fonts.xpath('w:font[@w:name=$name]', namespaces=NS, name=name)[0]
            self.assertIsNotNone(entry.find('w:embedRegular', NS))
            if name != 'GeoSlab703 Md BT':
                self.assertIsNotNone(entry.find('w:embedBold', NS))
        for name in self.bqs.namelist():
            if name.startswith('word/fonts/'):
                self.assertEqual(self.bqs.read(name), self.msc.read(name))

    def test_data_and_editor_anchors_stay_available(self):
        text = ''.join(self.doc.xpath('//w:t/text()', namespaces=NS))
        for token in ['{client}', '{operator}', '{supplier}', '{barge_inspector}',
                      '{captain}', '{cover_chief_engineer}', '{report_reference}']:
            self.assertIn(token, text)
        self.assertEqual(len(self.doc.xpath('//w:bookmarkStart[starts-with(@w:name,"bqs_s")]', namespaces=NS)), 21)
        for slot in ['cover', 'sounding_tables', 'vessel_tanks', 'barge_tanks', 'sampling']:
            self.assertEqual(len(self.doc.xpath('//w:sdtPr/w:tag[@w:val="bqs_photos_' + slot + '"]', namespaces=NS)), 1)
        for prefix in ['vessel_open', 'vessel_close', 'barge_open', 'barge_close']:
            self.assertIn('{#' + prefix + '_rows}{c0}', text)
            self.assertIn('{c12}{/' + prefix + '_rows}', text)
        for table in self.doc.findall('w:body/w:tbl', NS)[2:]:
            self.assertLessEqual(sum(int(v) for v in table.xpath('w:tblGrid/w:gridCol/@w:w', namespaces=NS)), 9923)

    def test_compact_density_tables_stay_with_their_introduction(self):
        tables = [t for t in self.doc.findall('w:body/w:tbl', NS)[2:]
                  if len(t.findall('w:tblGrid/w:gridCol', NS)) == 2]
        self.assertEqual(len(tables), 2)
        for table in tables:
            self.assertIsNotNone(table.getprevious().find('w:pPr/w:keepNext', NS))
            rows = table.findall('w:tr', NS)
            for row in rows:
                self.assertIsNotNone(row.find('w:trPr/w:cantSplit', NS))
            for row in rows[:-1]:
                for paragraph in row.findall('.//w:p', NS):
                    self.assertIsNotNone(paragraph.find('w:pPr/w:keepNext', NS))
            for paragraph in rows[-1].findall('.//w:p', NS):
                self.assertIsNone(paragraph.find('w:pPr/w:keepNext', NS))


if __name__ == '__main__':
    unittest.main()
