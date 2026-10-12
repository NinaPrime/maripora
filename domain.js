// Regras independentes da interface. O backend deve repetir estas validações.
export const KEY = 'maripora-v2';
export const DEMO_KEY = 'maripora-v2-demo';
export const LEGACY = { items: 'via-estoque-cptm-v1', history: 'via-estoque-history-v1', user: 'via-estoque-active-user-v1' };
export const CONDITIONS = ['Não inspecionado', 'Sem avarias aparentes', 'Requer avaliação', 'Restrito'];
export const DEFECTS = ['Rachaduras / trincas', 'Mofo / fungos', 'Lascas / fragmentação', 'Apodrecimento', 'Danos nas fixações', 'Queimaduras', 'Outros'];
export const TYPES = ['Madeira', 'Concreto', 'Aço', 'Composto', 'Outro'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const iso = () => new Date().toISOString();
export const fold = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const clone = x => JSON.parse(JSON.stringify(x));
export const integer = x => Number.isSafeInteger(Number(x)) && String(x).trim() !== '' && Number(x) >= 0;
export function validDate(x) { return /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x+'T12:00:00Z').toISOString().slice(0,10) === x; }
export function daysSince(date, now=today()) { return validDate(date) ? Math.max(0,Math.floor((Date.parse(now+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000)) : null; }
export function emptyState(name='Operador local') { return { schema:2, revision:0, items:[], inspections:[], movements:[], counts:[], history:[], outbox:[], profile:{name,role:'admin',email:''}, preferences:{theme:'light',largeText:false,overview:['stock','inspections','issues','counts']}, createdAt:iso() }; }
export function validateState(s) {
  if (!s || s.schema !== 2 || !['items','inspections','movements','counts','history','outbox'].every(k=>Array.isArray(s[k]))) throw new Error('Arquivo incompatível. Importe um backup Mariporã v2.');
  if (!s.profile || typeof s.profile.name !== 'string' || !['admin','user'].includes(s.profile.role)) throw new Error('Perfil inválido no backup.');
  const ids=new Set(), codes=new Set();
  for(const i of s.items) {
    if (!i || typeof i.id!=='string' || typeof i.code!=='string' || !i.code.trim() || typeof i.name!=='string' || !i.name.trim() || ids.has(i.id) || codes.has(fold(i.code.trim())) || !integer(i.stock) || !integer(i.min) || !['unit','lot'].includes(i.scope) || !Array.isArray(i.defects) || !CONDITIONS.includes(i.condition)) throw new Error('O backup contém materiais inválidos ou códigos duplicados.');
    if(i.scope==='unit' && Number(i.stock)>1) throw new Error('Unidades individuais não podem conter mais de um dormente.');
    if(![i.location,i.type,i.class,i.species,i.supplier].every(x=>typeof x==='string')) throw new Error('Campos de identificação inválidos no backup.');
    if(i.arrival&&!validDate(i.arrival)) throw new Error('Data de chegada inválida no backup.');
    if(i.count!==null&&i.count!==undefined&&!integer(i.count)) throw new Error('Contagem inválida no backup.');
    i.stock=Number(i.stock);i.min=Number(i.min);i.count=i.count===null||i.count===undefined?null:Number(i.count);
    if(i.count!==null){if(!integer(i.countExpected))throw new Error('Saldo da conferência inválido no backup.');i.countExpected=Number(i.countExpected);}
    ids.add(i.id);codes.add(fold(i.code.trim()));
  }
  for(const k of ['inspections','movements','counts']) for(const e of s[k]) if(!e || typeof e.id!=='string' || !ids.has(e.itemId)) throw new Error('O backup contém eventos sem material correspondente.');
  for(const e of s.inspections) {if(!validDate(e.date) || !CONDITIONS.includes(e.condition) || !Array.isArray(e.defects) || !integer(e.quantity)) throw new Error('Inspeção inválida no backup.');e.quantity=Number(e.quantity);}
  for(const e of s.movements) if(!validDate(e.date) || !['entry','exit','adjustment','opening'].includes(e.kind) || !Number.isSafeInteger(e.quantity)) throw new Error('Movimentação inválida no backup.');
  for(const e of s.counts) {if(!validDate(e.date) || !integer(e.quantity) || !integer(e.expected)) throw new Error('Conferência inválida no backup.');e.quantity=Number(e.quantity);e.expected=Number(e.expected);}
  for(const e of s.history) if(!e || typeof e.id!=='string' || typeof e.action!=='string' || typeof e.details!=='string') throw new Error('Histórico inválido no backup.');
  for(const e of s.outbox) if(!e || typeof e.id!=='string' || typeof e.action!=='string') throw new Error('Fila de sincronização inválida no backup.');
  s.preferences={theme:'light',largeText:false,overview:['stock','inspections','issues','counts'],...(s.preferences||{})};
  if(!Array.isArray(s.preferences.overview)) s.preferences.overview=['stock','inspections','issues','counts'];
  s.preferences.overview=[...new Set(s.preferences.overview.filter(x=>['stock','inspections','issues','counts'].includes(x)))];
  if(!s.preferences.overview.length)s.preferences.overview=['stock','inspections','issues','counts'];
  s.preferences.theme=s.preferences.theme==='dark'?'dark':'light';
  s.revision=Number.isSafeInteger(s.revision)?s.revision:0;
  return s;
}
export function migrateLegacy(rawItems,rawHistory=[],name='Operador local') {
  if (!Array.isArray(rawItems) || !Array.isArray(rawHistory)) throw new Error('Os dados da versão anterior não puderam ser lidos.');
  const s=emptyState(name); const ids=new Set(), codes=new Set();
  s.items=rawItems.map((x,n)=>{
    let id=String(x.id??uid()); if(ids.has(id)) id=uid();ids.add(id);
    const code=String(x.codigo??x.code??`LEGADO-${n+1}`).trim();
    if(codes.has(fold(code))) throw new Error('Há códigos duplicados na versão anterior. Exporte os dados antes de migrar.');codes.add(fold(code));
    const stock=Number(x.estoque??x.stock??0), min=Number(x.minimo??x.min??0), count=x.contagem??x.qty??null;
    if(!integer(stock)||!integer(min)|| (count!==null&&!integer(count))) throw new Error('Uma quantidade antiga é inválida. Os dados originais foram preservados.');
    const oldCondition=String(x.condicao??x.condition??'A verificar');
    return {id,code,name:String(x.nome??x.name??code),scope:'lot',type:TYPES.includes(x.tipo??x.type)?x.tipo??x.type:'Outro',class:'Não informada',species:'Não informada',length:'',width:'',height:'',location:String(x.localizacao??x.location??'Não informada'),stock,min,arrival:'',supplier:'Não informado',condition:CONDITIONS.includes(oldCondition)?oldCondition:'Não inspecionado',defects:[],notes:`Migrado da versão anterior. Condição anterior: ${oldCondition}.`,count:count===null?null:Number(count),countDate:null,countExpected:stock,createdAt:iso(),updatedAt:iso(),legacy:true};
  });
  s.history=rawHistory.map(x=>({id:uid(),at:x.data||iso(),user:String(x.usuario??'Não informado'),action:String(x.acao??'Registro anterior'),itemId:s.items.find(i=>i.code===x.codigo)?.id||null,code:String(x.codigo??''),details:String(x.detalhes??''),legacy:true}));
  if(s.items.length||s.history.length) s.history.unshift({id:uid(),at:iso(),user:name,action:'Migração',itemId:null,code:'',details:`${s.items.length} materiais e ${rawHistory.length} atividades preservados. Datas desconhecidas não foram inferidas.`});
  s.migratedAt=iso();return s;
}
export function load(storage,key=KEY) {
  const raw=storage.getItem(key);
  if(raw!==null) return validateState(JSON.parse(raw));
  if(key===DEMO_KEY) return emptyState();
  const old=storage.getItem(LEGACY.items), hist=storage.getItem(LEGACY.history);
  const state=old!==null||hist!==null?migrateLegacy(JSON.parse(old||'[]'),JSON.parse(hist||'[]'),storage.getItem(LEGACY.user)||undefined):emptyState();
  storage.setItem(key,JSON.stringify(state));return state;
}
// Escrita única: dados, histórico e fila são confirmados juntos.
export function persist(storage,key,previous,next) {
  const live=storage.getItem(key);
  if(live && JSON.parse(live).revision!==previous.revision) throw new Error('Os dados mudaram em outra aba. Recarregue a página antes de salvar.');
  next.revision=previous.revision+1;
  storage.setItem(key,JSON.stringify(next));return next;
}
export function log(s,action,item,details,payload={}) {
  const event={id:uid(),at:iso(),user:s.profile.name,action,itemId:item?.id||null,code:item?.code||'',details,...payload};
  s.history.unshift(event);
  s.outbox.push({id:event.id,action,createdAt:event.at,entityId:event.itemId,status:'pending',payload:clone(payload)});
  return event;
}
function requireText(value,label) { if(typeof value!=='string'||!value.trim()) throw new Error(`Preencha ${label}.`);return value.trim(); }
export function addItem(s,data) {
  const code=requireText(data.code,'o código');
  if(s.items.some(i=>fold(i.code)===fold(code))) throw new Error('Este código já está cadastrado. Abra a ficha para adicionar uma inspeção.');
  const item={id:uid(),scope:data.scope,type:data.type,length:data.length,width:data.width,height:data.height,arrival:data.arrival,notes:String(data.notes||''),code,name:requireText(data.name,'a descrição'),location:requireText(data.location,'a localização'),supplier:requireText(data.supplier,'a origem / fornecedor'),class:requireText(data.class,'a classe'),species:data.type==='Madeira'?requireText(data.species,'a espécie'):'Não se aplica',stock:Number(data.stock),min:Number(data.min),count:null,countDate:null,countExpected:null,condition:'Não inspecionado',defects:[],createdAt:iso(),updatedAt:iso()};
  if(!TYPES.includes(item.type)||!['lot','unit'].includes(item.scope)) throw new Error('Selecione um tipo e uma identificação válidos.');
  if(!integer(data.stock)||!integer(data.min)||item.stock<1) throw new Error('Informe quantidades inteiras. O cadastro inicial precisa de pelo menos uma unidade.');
  if(item.scope==='unit'&&item.stock!==1) throw new Error('Uma identificação individual deve conter exatamente uma unidade.');
  if(!validDate(item.arrival)||item.arrival>today()) throw new Error('Informe uma data de chegada válida, até hoje.');
  for(const k of ['length','width','height']) if(!Number.isFinite(Number(item[k]))||Number(item[k])<=0) throw new Error('Preencha as três dimensões em centímetros com valores positivos.');
  s.items.unshift(item);
  s.movements.unshift({id:uid(),itemId:item.id,kind:'entry',quantity:item.stock,date:item.arrival,at:iso(),user:s.profile.name,note:'Entrada inicial',before:0,after:item.stock});
  log(s,'Cadastro',item,`Entrada de ${item.stock} un. em ${item.location}.`,{item:clone(item)});
  return item;
}
export function inspect(s,id,data) {
  const item=s.items.find(i=>i.id===id);if(!item) throw new Error('Material não encontrado.');
  if(!validDate(data.date)||data.date>today()||(item.arrival&&data.date<item.arrival)) throw new Error('A inspeção deve ocorrer entre a chegada e hoje.');
  if(!CONDITIONS.slice(1).includes(data.condition)) throw new Error('Selecione a condição observada.');
  if(!integer(data.quantity)||Number(data.quantity)<1||Number(data.quantity)>item.stock) throw new Error('A quantidade inspecionada deve estar entre 1 e o estoque disponível.');
  if(!Array.isArray(data.defects)||data.defects.some(x=>!DEFECTS.includes(x))) throw new Error('Ocorrência inválida.');
  if(data.condition==='Sem avarias aparentes'&&data.defects.length) throw new Error('Há ocorrências marcadas. Revise a condição observada.');
  if(data.defects.includes('Outros')&&!data.notes?.trim()) throw new Error('Descreva a ocorrência em Outros.');
  const e={id:uid(),itemId:id,date:data.date,condition:data.condition,defects:[...data.defects],quantity:Number(data.quantity),notes:String(data.notes||''),at:iso(),user:s.profile.name,reportedAt:null};
  s.inspections.unshift(e);
  const latest=s.inspections.filter(i=>i.itemId===id).sort((a,b)=>b.date.localeCompare(a.date)||b.at.localeCompare(a.at))[0];
  item.condition=latest.condition;item.defects=latest.defects;item.lastInspection=latest.date;item.inspectedQuantity=latest.quantity;item.updatedAt=iso();
  log(s,'Inspeção',item,`${e.condition}. ${e.quantity} un. observadas em ${e.date}.`,{inspection:clone(e)});return e;
}
export function countItem(s,id,quantity,note='') {
  const item=s.items.find(i=>i.id===id);if(!item) throw new Error('Material não encontrado.');
  if(!integer(quantity)) throw new Error('A contagem deve ser um número inteiro igual ou maior que zero.');
  if(item.scope==='unit'&&Number(quantity)>1) throw new Error('Uma identificação individual admite contagem de 0 ou 1.');
  const e={id:uid(),itemId:id,quantity:Number(quantity),expected:item.stock,date:today(),at:iso(),user:s.profile.name,note};
  s.counts.unshift(e);item.count=e.quantity;item.countDate=e.date;item.countExpected=e.expected;item.updatedAt=iso();
  log(s,'Conferência',item,`${e.quantity} contadas / ${e.expected} registradas. Diferença: ${e.quantity-e.expected}.`,{count:clone(e)});return e;
}
export function move(s,id,data) {
  const item=s.items.find(i=>i.id===id);if(!item) throw new Error('Material não encontrado.');
  if(!['entry','exit','adjustment'].includes(data.kind)) throw new Error('Tipo de movimentação inválido.');
  if(data.kind==='adjustment'&&s.profile.role!=='admin') throw new Error('O ajuste é exclusivo do administrador.');
  if(!integer(data.quantity)||(data.kind!=='adjustment'&&Number(data.quantity)<1)) throw new Error('Informe uma quantidade inteira válida.');
  if(!validDate(data.date)||data.date>today()||(item.arrival&&data.date<item.arrival)) throw new Error('A data deve estar entre a chegada e hoje.');
  const note=requireText(data.note,'o motivo / destino');const before=item.stock;
  const delta=data.kind==='entry'?Number(data.quantity):data.kind==='exit'?-Number(data.quantity):Number(data.quantity)-before;
  if(before+delta<0) throw new Error('A saída excede o estoque disponível.');
  if(item.scope==='unit'&&before+delta>1) throw new Error('Uma identificação individual admite no máximo uma unidade.');
  item.stock+=delta;item.updatedAt=iso();
  const e={id:uid(),itemId:id,kind:data.kind,quantity:delta,date:data.date,at:iso(),user:s.profile.name,note,before,after:item.stock};
  s.movements.unshift(e);
  // A contagem anterior permanece no histórico; movimentação exige nova conferência.
  item.count=null;item.countDate=null;item.countExpected=null;
  log(s,'Movimentação',item,`${data.kind==='entry'?'Entrada':data.kind==='exit'?'Saída':'Ajuste'}: ${Math.abs(delta)} un. Saldo: ${item.stock}. ${note}`,{movement:clone(e)});return e;
}
export function correctItem(s,id,data,reason) {
  if(s.profile.role!=='admin') throw new Error('Correções são exclusivas do administrador.');
  const i=s.items.find(x=>x.id===id);if(!i) throw new Error('Material não encontrado.');requireText(reason,'a justificativa');
  const before=clone(i), fields=['name','location','supplier','class','species','length','width','height','arrival','min','notes'];
  for(const k of fields) if(k in data) i[k]=data[k];
  for(const k of ['name','location','supplier','class']) requireText(i[k],k);
  if(i.type==='Madeira') requireText(i.species,'a espécie');
  if(!integer(i.min)) throw new Error('O estoque mínimo deve ser inteiro e não negativo.');i.min=Number(i.min);
  for(const k of ['length','width','height']) if(!Number.isFinite(Number(i[k]))||Number(i[k])<=0) throw new Error('Informe dimensões positivas.');
  if(!validDate(i.arrival)||i.arrival>today()||s.inspections.some(e=>e.itemId===id&&e.date<i.arrival)||s.movements.some(e=>e.itemId===id&&e.date<i.arrival)) throw new Error('A chegada deve ser válida e anterior ou igual aos eventos já registrados.');
  i.updatedAt=iso();log(s,'Correção',i,reason,{before,after:clone(i)});return i;
}
export const issues = i => i.condition==='Requer avaliação'||i.condition==='Restrito';
export const divergence = i => i.count!==null&&i.count!==undefined&&i.count!==i.countExpected;
export function matches(i,{search='',type='',condition='',status='',location=''}={}) {
  return (!search||fold([i.code,i.name,i.location,i.species,i.class].join(' ')).includes(fold(search)))&&(!type||i.type===type)&&(!condition||i.condition===condition)&&(!location||fold(i.location).includes(fold(location)))&&(!status||status==='pending'&&i.condition==='Não inspecionado'||status==='issues'&&issues(i)||status==='diff'&&divergence(i)||status==='low'&&i.stock<=i.min||status==='today'&&i.countDate===today());
}
export function metrics(s) {return { stock:s.items.reduce((a,i)=>a+i.stock,0),lots:s.items.length,pending:s.items.filter(i=>i.condition==='Não inspecionado').length,issues:s.items.filter(issues).length,counts:s.items.filter(i=>i.countDate===today()).length,diff:s.items.filter(divergence).length,low:s.items.filter(i=>i.stock<=i.min).length,reportPending:s.inspections.filter(i=>!i.reportedAt).length };}
export function parseQR(text) {
  const raw=String(text||'').trim();if(!raw||raw.length>2048) throw new Error('Código vazio ou muito longo.');
  if(raw.startsWith('{')) {let obj;try{obj=JSON.parse(raw);}catch{throw new Error('QR Code contém JSON inválido.');}const code=obj.code??obj.codigo??obj.id;if(typeof code!=='string'&&typeof code!=='number') throw new Error('O QR Code precisa conter um código de identificação.');return String(code).trim();}
  if(/^https?:\/\//i.test(raw)) {const u=new URL(raw);const code=u.searchParams.get('codigo')||u.searchParams.get('code');if(code)return code.trim();if(u.hash.startsWith('#ficha/'))return decodeURIComponent(u.hash.slice(7));throw new Error('O endereço não contém um código Mariporã. Digite a identificação da etiqueta.');}
  return raw;
}
export function reportData(s,{from='',to='',type='',location=''}={}) {
  if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to)) throw new Error('Revise o intervalo de datas.');
  const items=s.items.filter(i=>matches(i,{type,location})), ids=new Set(items.map(i=>i.id));
  const inRange=e=>ids.has(e.itemId)&&(!from||e.date>=from)&&(!to||e.date<=to);
  return {items:clone(items),inspections:clone(s.inspections.filter(inRange)),movements:clone(s.movements.filter(inRange)),counts:clone(s.counts.filter(inRange)),from,to,createdAt:iso(),user:s.profile.name};
}
export function grouped(items,field) {const map=new Map();for(const i of items) {const k=i[field]||'Não informado';map.set(k,(map.get(k)||0)+i.stock);}return [...map].sort((a,b)=>b[1]-a[1]);}
export function periodBuckets(s,period='month',year=new Date().getFullYear()) {
  const count=period==='year'?1:period==='semester'?2:12;
  const labels=count===1?[String(year)]:count===2?['1º semestre','2º semestre']:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const rows=labels.map(label=>({label,entry:0,exit:0}));
  for(const e of s.movements) {if(Number(e.date.slice(0,4))!==Number(year)||!['entry','exit'].includes(e.kind))continue;const m=Number(e.date.slice(5,7))-1;const idx=count===1?0:count===2?Math.floor(m/6):m;if(rows[idx])rows[idx][e.kind]+=Math.abs(e.quantity);}
  return rows;
}
export function seedDemo() {
  const s=emptyState('Equipe Porã');const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const data=[['DOR-MAD-001','Dormente de eucalipto','Madeira','Eucalipto','Classe I','Pátio A · Setor 01',84,92],['DOR-CON-002','Dormente monobloco','Concreto','Não se aplica','Monobloco','Pátio B · Setor 03',126,21],['DOR-MAD-003','Dormente de itaúba','Madeira','Itaúba','Classe II','Pátio A · Setor 02',32,148],['DOR-MAD-004','Dormente de eucalipto','Madeira','Eucalipto','Classe I','Pátio C · Setor 01',8,43],['DOR-CON-005','Dormente bibloco','Concreto','Não se aplica','Bibloco','Pátio B · Setor 04',57,15],['DOR-MAD-006','Dormente de jatobá','Madeira','Jatobá','Classe II','Pátio A · Setor 02',41,65]];
  for(const [n,row] of data.entries()) {
    const [code,name,type,species,cl,location,stock,days]=row;
    const i=addItem(s,{code,name,type,species,class:cl,location,stock,min:10,scope:'lot',arrival:ago(days),supplier:'Fornecedor de demonstração',length:280,width:24,height:16,notes:'Dado fictício para explorar a interface.'});
    if(n!==4) inspect(s,i.id,{date:ago(n===2?2:0),condition:n===2?'Restrito':n===3?'Requer avaliação':'Sem avarias aparentes',defects:n===2?['Apodrecimento']:n===3?['Rachaduras / trincas']:[],quantity:Math.min(8,stock),notes:'Inspeção demonstrativa.'});
    if(n<3) countItem(s,i.id,stock-(n===2?2:0));
  }
  s.outbox=[];s.demo=true;return s;
}
