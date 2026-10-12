import { grouped, CONDITIONS } from './domain.js';

export function download(name,data,type='application/octet-stream') {
  const blob=data instanceof Blob?data:new Blob([data],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const codeFor=(data,id)=>data.items.find(i=>i.id===id)?.code||id;
const number=x=>typeof x==='number'?x:x===''||x===null||x===undefined?'':Number(x);
export function sheetsFor(data) {
  return [
    {name:'Inventário atual',rows:[['Código','Descrição','Identificação','Material','Classe','Espécie','Comprimento (cm)','Largura (cm)','Altura (cm)','Localização','Estoque atual','Estoque mínimo','Data de chegada','Origem / fornecedor','Condição da última inspeção','Quantidade observada na última inspeção','Última inspeção','Contagem física','Data da contagem','Saldo comparado na contagem'],...data.items.map(i=>[i.code,i.name,i.scope==='lot'?'Lote':'Unidade',i.type,i.class,i.species,number(i.length),number(i.width),number(i.height),i.location,i.stock,i.min,i.arrival,i.supplier,i.condition,i.inspectedQuantity??'',i.lastInspection||'',i.count??'',i.countDate||'',i.countExpected??''])]},
    {name:'Inspeções',rows:[['Código','Data','Responsável','Condição observada','Quantidade observada','Ocorrências','Observações','ID da inspeção'],...data.inspections.map(e=>[codeFor(data,e.itemId),e.date,e.user,e.condition,e.quantity,e.defects.join('; '),e.notes,e.id])]},
    {name:'Movimentações',rows:[['Código','Data','Responsável','Tipo','Variação (un.)','Saldo anterior','Saldo posterior','Motivo / destino','ID da movimentação'],...data.movements.map(e=>[codeFor(data,e.itemId),e.date,e.user,{entry:'Entrada',exit:'Saída',adjustment:'Ajuste',opening:'Saldo inicial'}[e.kind],e.quantity,e.before,e.after,e.note,e.id])]},
    {name:'Conferências',rows:[['Código','Data','Responsável','Contagem','Saldo comparado','Diferença','Observações'],...data.counts.map(e=>[codeFor(data,e.itemId),e.date,e.user,e.quantity,e.expected,e.quantity-e.expected,e.note])]},
    {name:'Sobre o relatório',rows:[['Campo','Informação'],['Projeto','Mariporã - Projeto Porã'],['Emissão',data.createdAt],['Responsável',data.user],['Período dos eventos',`${data.from||'Todos'} até ${data.to||'Hoje'}`],['Estoque','Saldo atual. O filtro de datas afeta eventos, não o inventário.'],['Condição','Última inspeção por identificação. Não classifica todas as peças de um lote.'],['Modelo','Modelo do projeto; não substitui laudo ou formulário oficial.']]},
  ];
}
// Evita que textos exportados sejam interpretados como fórmulas no Excel.
export function csvCell(value) {const v=typeof value==='string'&&/^[\s]*[=+\-@\t\r]/.test(value)?"'"+value:String(value??'');return '"'+v.replaceAll('"','""')+'"';}
export function csvBytes(data) {return '\ufeff'+sheetsFor(data)[0].rows.map(r=>r.map(csvCell).join(';')).join('\r\n');}
export function exportCSV(data){download('maripora-inventario.csv',csvBytes(data),'text/csv;charset=utf-8');}

const encoder=new TextEncoder();
const xml=x=>String(x??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const column=n=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
let crcTable;
function crc32(bytes){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function concat(parts){const result=new Uint8Array(parts.reduce((a,p)=>a+p.length,0));let off=0;for(const p of parts){result.set(p,off);off+=p.length;}return result;}
// ZIP sem compressão. Pequeno e independente de rede para exportação offline.
export function zipFiles(files){const local=[],central=[];let offset=0;for(const [filename,content] of files){const name=encoder.encode(filename),bytes=typeof content==='string'?encoder.encode(content):content,crc=crc32(bytes),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);header.set(name,30);local.push(header,bytes);const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=header.length+bytes.length;}const end=new Uint8Array(22),ev=new DataView(end.buffer),centralLength=central.reduce((a,c)=>a+c.length,0);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralLength,true);ev.setUint32(16,offset,true);return concat([...local,...central,end]);}
export function xlsxBytes(data){
  const sheets=sheetsFor(data);const files=[];
  files.push(['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
  files.push(['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
  files.push(['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`]);
  files.push(['xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml','<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB4232D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
  for(const [i,s] of sheets.entries())files.push([`xl/worksheets/sheet${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${s.rows[0].map((_,n)=>`<col min="${n+1}" max="${n+1}" width="${n===1?32:24}" customWidth="1"/>`).join('')}</cols><sheetData>${s.rows.map((row,r)=>`<row r="${r+1}"${r===0?' ht="34" customHeight="1"':''}>${row.map((value,c)=>`<c r="${column(c)}${r+1}" s="${r===0?1:0}" ${typeof value==='number'&&Number.isFinite(value)?`t="n"><v>${value}</v>`:`t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is>`}</c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${column(s.rows[0].length-1)}${s.rows.length}"/></worksheet>`]);
  return zipFiles(files);
}
export function exportXLSX(data){download('maripora-relatorio.xlsx',xlsxBytes(data),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}

// PDF vetorial paginado; fonte WinAnsi inclui os acentos portugueses.
// O texto mantém os dados originais nos backups e no Excel (Unicode).
const replacements={'–':'-','—':'-','→':'>','↗':'>','…':'...','’':"'",'‘':"'",'“':'"','”':'"','•':'*','✓':'OK','×':'x'};
function latin(text){return String(text??'').normalize('NFC').replace(/[–—→↗…’‘“”•✓×]/g,c=>replacements[c]).replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');}
const pdfText=text=>latin(text).replace(/([\\()])/g,'\\$1').replace(/[\r\n]/g,' ');
function latinBytes(s){return Uint8Array.from(s,c=>c.charCodeAt(0)&255);}
function width(text,size){return [...latin(text)].reduce((a,c)=>a+(/[ilI.,' !:;]/.test(c)?.26:/[MW@]/.test(c)?.85:/[A-Z]/.test(c)?.65:.52),0)*size;}
function wrap(text,size,maxWidth){const result=[];for(const paragraph of latin(text).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(width(word,size)>maxWidth){if(line){result.push(line);line='';}let chunk='';for(const c of word){if(width(chunk+c,size)>maxWidth){result.push(chunk);chunk='';}chunk+=c;}line=chunk;}else if(line&&width(line+' '+word,size)>maxWidth){result.push(line);line=word;}else line+=(line?' ':'')+word;}result.push(line);}return result;}
export class PDF {
  constructor(title='Relatório de acompanhamento'){this.title=title;this.pages=[];this.newPage();}
  newPage(){this.page=[];this.pages.push(this.page);this.y=86;this.rect(38,32,6,29,[.706,.137,.176]);this.draw('MARIPORÃ',55,48,15,true);this.draw('PROJETO PORÃ  /  INSPEÇÃO DE DORMENTES',55,63,7,false,[.4,.44,.42]);}
  draw(text,x,y,size=9,bold=false,color=[.13,.17,.15]){this.page.push(`${color.join(' ')} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${842-y} Tm (${pdfText(text)}) Tj ET`);}
  rect(x,y,w,h,color){this.page.push(`${color.join(' ')} rg ${x} ${842-y-h} ${w} ${h} re f`);}
  line(x1,y1,x2,y2){this.page.push(`0.88 0.9 0.88 RG 0.6 w ${x1} ${842-y1} m ${x2} ${842-y2} l S`);}
  ensure(h){if(this.y+h>787)this.newPage();}
  text(text,{size=9,bold=false,color=[.13,.17,.15],gap=8}={}){const lines=wrap(text,size,515);for(const line of lines){this.ensure(size*1.5);this.draw(line,40,this.y,size,bold,color);this.y+=size*1.5;}this.y+=gap;}
  heading(text){this.ensure(100);this.y+=10;this.text(text,{size:13,bold:true,gap:9});}
  table(headers,rows,widths){
    const drawHeader=()=>{this.rect(40,this.y,515,25,[.95,.96,.95]);let x=47;for(let c=0;c<headers.length;c++){const lines=wrap(headers[c],7,widths[c]-12);lines.slice(0,2).forEach((v,n)=>this.draw(v,x,this.y+10+n*9,7,true));x+=widths[c];}this.y+=25;};
    this.ensure(65);drawHeader();
    for(const row of rows){const cols=row.map((v,c)=>wrap(v,8,widths[c]-14));let lineOffset=0;const length=Math.max(...cols.map(c=>c.length));const fullHeight=length*11+14;if(fullHeight<640&&this.y+fullHeight>782){this.newPage();drawHeader();}
      while(lineOffset<length){const remainingLines=Math.max(1,Math.floor((782-this.y-14)/11));if(this.y+28>782){this.newPage();drawHeader();continue;}
        const take=Math.min(remainingLines,length-lineOffset),h=take*11+14;let x=47;
        for(let c=0;c<cols.length;c++){const lines=cols[c].slice(lineOffset,lineOffset+take);if(c===0&&lineOffset>0&&!lines.length){lines.push(cols[0][0], '(continuação)');}lines.forEach((line,n)=>this.draw(line,x,this.y+13+n*11,8));x+=widths[c];}
        this.y+=h;this.line(40,this.y,555,this.y);lineOffset+=take;
        if(lineOffset<length){this.newPage();drawHeader();}
      }
    }this.y+=12;
  }
  bars(title,rows,suffix='un.'){this.heading(title);if(!rows.length){this.text('Sem dados para exibir.');return;}const max=Math.max(1,...rows.map(r=>r[1]));for(const [label,value]of rows){const lines=wrap(label,8,195);const height=Math.max(26,lines.length*11+10);this.ensure(height);lines.forEach((l,n)=>this.draw(l,40,this.y+n*11+10,8));this.rect(248,this.y+2,235,10,[.94,.95,.94]);this.rect(248,this.y+2,235*value/max,10,[.706,.137,.176]);this.draw(`${value} ${suffix}`,492,this.y+11,7);this.y+=height;}}
  bytes(){
    const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const kids=[];this.pages.forEach((p,n)=>{const pageId=objects.length,streamId=pageId+1;kids.push(`${pageId} 0 R`);const foot=`0.42 0.46 0.43 rg BT /F1 7 Tf 1 0 0 1 40 27 Tm (${pdfText(this.title)}) Tj ET\nBT /F1 7 Tf 1 0 0 1 503 27 Tm (${n+1} / ${this.pages.length}) Tj ET`;const stream=p.join('\n')+'\n'+foot;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,`<< /Length ${latinBytes(stream).length} >>\nstream\n${stream}\nendstream`);});
    objects[2]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
    let output='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=latinBytes(output).length;output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}const xref=latinBytes(output).length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return latinBytes(output);
  }
}
export function pdfBytes(data,charts=[]){
  const p=new PDF(),emitted=new Date(data.createdAt).toLocaleString('pt-BR');
  p.heading('Relatório de acompanhamento');p.text(`Emissão: ${emitted}  |  Responsável: ${data.user}`);
  p.text(`Período dos eventos: ${data.from||'primeiro registro'} até ${data.to||'data de emissão'}.`);
  p.text(`Estoque atual: ${data.items.reduce((a,i)=>a+i.stock,0)} unidades em ${data.items.length} identificações. ${data.inspections.length} inspeções no período.`,{bold:true});
  p.text('O saldo é o estoque atual. O período selecionado filtra inspeções, movimentações e conferências. As condições se referem à última inspeção de cada identificação, inclusive quando a amostra é parcial.',{size:8,color:[.4,.44,.42]});
  if(charts.includes('condition'))p.bars('Condição das identificações',CONDITIONS.map(c=>[c,data.items.filter(i=>i.condition===c).length]).filter(r=>r[1]),'ident.');
  if(charts.includes('species'))p.bars('Estoque de madeira por espécie',grouped(data.items.filter(i=>i.type==='Madeira'),'species'));
  if(charts.includes('class'))p.bars('Estoque por classe',grouped(data.items,'class'));
  if(charts.includes('movement'))p.bars('Entradas e saídas no período',[['Entradas',data.movements.filter(e=>e.kind==='entry').reduce((a,e)=>a+e.quantity,0)],['Saídas',data.movements.filter(e=>e.kind==='exit').reduce((a,e)=>a+Math.abs(e.quantity),0)]]);
  p.heading('Inventário: saldo atual');p.table(['Código / descrição','Localização / chegada','Estoque','Condição'],data.items.map(i=>[`${i.code}\n${i.name}`,`${i.location}\n${i.arrival||'Chegada não informada'}`,`${i.stock} un.`,i.condition]),[158,156,56,145]);
  p.heading('Inspeções no período');
  if(data.inspections.length)p.table(['Código / data','Condição / quantidade observada','Ocorrências / responsável'],data.inspections.map(e=>[`${codeFor(data,e.itemId)}\n${e.date}`,`${e.condition}\n${e.quantity} unidades observadas`,`${e.defects.join(', ')||'Sem ocorrências'}\n${e.user}${e.notes?'\n'+e.notes:''}`]),[130,160,225]);else p.text('Nenhuma inspeção no intervalo selecionado.');
  p.heading('Movimentações no período');if(data.movements.length)p.table(['Código / data','Tipo / variação','Saldo / motivo'],data.movements.map(e=>[`${codeFor(data,e.itemId)}\n${e.date}`,`${{entry:'Entrada',exit:'Saída',adjustment:'Ajuste',opening:'Saldo inicial'}[e.kind]}\n${e.quantity} un.`,`${e.before} para ${e.after} un.\n${e.note}\n${e.user}`]),[150,125,240]);else p.text('Nenhuma movimentação no intervalo selecionado.');
  p.heading('Conferências no período');if(data.counts.length)p.table(['Código / data','Contagem / saldo','Responsável / observações'],data.counts.map(e=>[`${codeFor(data,e.itemId)}\n${e.date}`,`${e.quantity} contadas\n${e.expected} registradas\nDiferença: ${e.quantity-e.expected}`,`${e.user}\n${e.note||''}`]),[150,125,240]);else p.text('Nenhuma conferência no intervalo selecionado.');
  p.heading('Notas de interpretação');p.text('Modelo de acompanhamento do Projeto Porã, sujeito à validação da equipe. Não substitui laudo técnico, relatório ambiental oficial ou autorização para uso dos dormentes. O tempo de armazenamento é contado desde a chegada, sem prazo de validade presumido.',{size:8});
  return p.bytes();
}
export function exportPDF(data,charts){download('maripora-relatorio.pdf',pdfBytes(data,charts),'application/pdf');}
export function manualBytes(guides){const p=new PDF('Manual de uso - Mariporã');p.heading('Manual de uso');p.text('Registro e acompanhamento de dormentes | Versão 2.0');for(const [,title,desc,steps]of guides){p.heading(title);p.text(desc);steps.forEach((s,n)=>p.text(`${n+1}. ${s}`));}p.heading('Acessibilidade e versão local');p.text('O menu inferior dá acesso às funções principais no celular. Em Mais estão as outras áreas. Em Conta e dados, alterne entre modo claro e escuro ou ative texto ampliado. Todos os controles podem ser utilizados pelo teclado e identificados por leitores de tela.');p.text('Esta versão salva os dados no navegador. A fila de alterações não indica envio confirmado: a base compartilhada, o login institucional, a recuperação de senha e a gestão de usuários aguardam integração com o backend.');p.text('A demonstração usa uma base separada. Para migrar automaticamente a versão anterior, abra a nova aplicação na mesma origem e no mesmo navegador. Dados de uma origem não ficam automaticamente disponíveis em outra.');return p.bytes();}
export function manualPDF(guides){download('maripora-manual.pdf',manualBytes(guides),'application/pdf');}
