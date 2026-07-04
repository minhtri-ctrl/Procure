import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// Chèn vòng lặp {{#items}}...{{/items}} bao quanh DÒNG bảng chứa {{TEN_HANG}}
// để hỗ trợ nhiều dòng hàng (mẫu gốc chỉ có 1 dòng).
function injectItemsLoop(xml) {
  const idx = xml.indexOf('TEN_HANG');
  if (idx === -1) return xml;
  const rowStart = xml.lastIndexOf('<w:tr', idx);
  const rowEndTag = xml.indexOf('</w:tr>', idx);
  if (rowStart === -1 || rowEndTag === -1) return xml;
  const rowEnd = rowEndTag + '</w:tr>'.length;
  const row = xml.slice(rowStart, rowEnd);
  const mOpen = /<w:t(?:\s[^>]*)?>/.exec(row); // thẻ text <w:t> (không nhầm <w:tc>/<w:tr>/<w:tPr>)
  const lastTClose = row.lastIndexOf('</w:t>');
  if (!mOpen || lastTClose === -1) return xml;
  const firstTGt = mOpen.index + mOpen[0].length;
  const newRow = row.slice(0, firstTGt) + '{{#items}}' + row.slice(firstTGt, lastTClose) + '{{/items}}' + row.slice(lastTClose);
  return xml.slice(0, rowStart) + newRow + xml.slice(rowEnd);
}

// Render 1 hợp đồng .docx từ buffer mẫu + dữ liệu. Trả về Buffer (.docx).
export function renderContract(templateBuffer, data) {
  const zip = new PizZip(templateBuffer);
  const path = 'word/document.xml';
  zip.file(path, injectItemsLoop(zip.file(path).asText()));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '', // placeholder thiếu -> rỗng
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
