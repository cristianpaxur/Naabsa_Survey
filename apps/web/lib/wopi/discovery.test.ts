import { describe, it, expect } from 'vitest';
import { parseDiscovery } from './discovery';

// Trecho representativo do /hosting/discovery do Collabora.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      <action name="view" ext="docx" urlsrc="https://office.example/browser/abc/cool.html?"/>
      <action name="edit" ext="docx" urlsrc="https://office.example/browser/abc/cool.html?permission=edit&amp;"/>
    </app>
    <app name="application/pdf">
      <action name="view" ext="pdf" urlsrc="https://office.example/browser/abc/cool.html?"/>
    </app>
  </net-zone>
</wopi-discovery>`;

describe('wopi/discovery parseDiscovery', () => {
  it('prefere a action edit para docx', () => {
    const map = parseDiscovery(XML);
    expect(map['docx']).toContain('permission=edit');
  });

  it('inclui outras extensões (pdf como view)', () => {
    const map = parseDiscovery(XML);
    expect(map['pdf']).toContain('cool.html');
  });

  it('retorna vazio para XML sem actions', () => {
    expect(parseDiscovery('<wopi-discovery></wopi-discovery>')).toEqual({});
  });
});
