import { useState, useEffect, useReducer, useMemo } from "react";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const R$ = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const N = (v,d=2) => new Intl.NumberFormat("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v||0);
const clamp = (v,mn,mx) => Math.max(mn,Math.min(mx,v));

// ═══════════════════════════════════════════════════════
// BANCO DE DADOS
// ═══════════════════════════════════════════════════════
const DB_CHAPAS = [
  {id:"mdf15",nome:"MDF 15mm",esp:15,larg:2750,alt:1850,preco:189.90},
  {id:"mdf18",nome:"MDF 18mm",esp:18,larg:2750,alt:1850,preco:219.90},
  {id:"mdf25",nome:"MDF 25mm",esp:25,larg:2750,alt:1850,preco:289.90},
  {id:"mdp15",nome:"MDP 15mm BP",esp:15,larg:2750,alt:1850,preco:149.90},
  {id:"mdp18",nome:"MDP 18mm BP",esp:18,larg:2750,alt:1850,preco:169.90},
  {id:"comp3",nome:"Compensado 3mm",esp:3,larg:2750,alt:1850,preco:59.90},
];
const DB_FITAS = [
  {id:"fita22",nome:"Fita de Borda 22mm",larg:22,preco:0.85},
  {id:"fita35",nome:"Fita de Borda 35mm",larg:35,preco:1.20},
];
const DB_FERRAGENS = [
  {id:"corr350",nome:"Corrediça 350mm",preco:28.90,un:"par"},
  {id:"corr400",nome:"Corrediça 400mm",preco:32.90,un:"par"},
  {id:"corr500",nome:"Corrediça 500mm",preco:42.90,un:"par"},
  {id:"corrFH",nome:"Corrediça Full Ext. Soft",preco:68.90,un:"par"},
  {id:"dob110",nome:"Dobradiça 110° Amort.",preco:8.90,un:"un"},
  {id:"dob165",nome:"Dobradiça 165° Amort.",preco:14.90,un:"un"},
  {id:"pux128",nome:"Puxador 128mm",preco:12.90,un:"un"},
  {id:"pux256",nome:"Puxador 256mm",preco:22.90,un:"un"},
  {id:"cabOval",nome:"Cabideiro Tubo Oval",preco:18.90,un:"m"},
  {id:"sapReg",nome:"Sapateira Regulável",preco:45.90,un:"un"},
  {id:"cestoAr",nome:"Cesto Aramado",preco:65.90,un:"un"},
];
const DB_ACABAMENTOS = [
  {id:"bp_branco",nome:"BP Branco TX",preco:0,un:"incluso"},
  {id:"bp_cinza",nome:"BP Cinza Etna",preco:0,un:"incluso"},
  {id:"bp_nogueira",nome:"BP Nogueira Boreal",preco:0,un:"incluso"},
  {id:"lam_freijo",nome:"Lâmina Natural Freijó",preco:85.00,un:"m²"},
  {id:"lam_carv",nome:"Lâmina Natural Carvalho",preco:95.00,un:"m²"},
  {id:"laca_branca",nome:"Laca PU Branca Fosca",preco:120.00,un:"m²"},
  {id:"laca_color",nome:"Laca PU Colorida Fosca",preco:135.00,un:"m²"},
];

// ═══════════════════════════════════════════════════════
// CATÁLOGO DE MÓDULOS
// ═══════════════════════════════════════════════════════
const CATALOGO = [
  {
    id:"arm_alto", nome:"Armário Alto", desc:"Roupeiro, despensa — caixaria completa",
    cat:"caixaria", coef:1.0,
    internas:[
      {id:"le",nome:"Lateral Esquerda",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"ld",nome:"Lateral Direita",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"tp",nome:"Topo (Chapéu)",calc:"Li*P",mat:"mdf18",fita:["f"]},
      {id:"bs",nome:"Base",calc:"Li*P",mat:"mdf18",fita:["f"]},
      {id:"fn",nome:"Fundo",calc:"Li*Ai",mat:"comp3",fita:[]},
    ],
    externas:[
      {id:"te",nome:"Tamp. Lat. Esquerda",face:"lat_esq",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"td",nome:"Tamp. Lat. Direita",face:"lat_dir",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"tt",nome:"Tamp. Topo",face:"topo",calc:"L*P",mat:"mdf18",fita:["f"]},
      {id:"tb",nome:"Rodapé / Base Vista",face:"base",calc:"L*100",mat:"mdf18",fita:["f"]},
      {id:"tf",nome:"Costas Vista",face:"fundo",calc:"L*A",mat:"mdf18",fita:[]},
    ],
    subs:[
      {id:"prat",nome:"Prateleira",calc:"Li*Pi",mat:"mdf18",fita:["f"],tipo:"peca",max:20},
      {id:"cabid",nome:"Cabideiro",ferrId:"cabOval",calcM:"Li",tipo:"ferr",max:5},
      {id:"maleiro",nome:"Maleiro",calc:"Li*P",mat:"mdf18",fita:["f"],tipo:"peca",max:3},
      {id:"divV",nome:"Divisória Vertical",calc:"Ai*P",mat:"mdf18",fita:["f"],tipo:"peca",max:5},
    ],
    porta:{calc:"Lp*Ap",mat:"mdf18",fita:["all"],regras:[
      {ferrId:"dob110",form:"Ap<=1600?2:Ap<=2000?3:4"},
      {ferrId:"pux128",form:"1"},
    ]},
    gaveta:{alt:150,pecas:[
      {nome:"Frente Gaveta",calc:"Lg*Ag",mat:"mdf18",fita:["all"]},
      {nome:"Lateral Gaveta",calc:"Pg*Ag",mat:"mdf15",fita:["t"],mult:2},
      {nome:"Traseira Gaveta",calc:"Lg*(Ag-15)",mat:"mdf15",fita:[]},
      {nome:"Fundo Gaveta",calc:"Lg*Pg",mat:"comp3",fita:[]},
    ],regras:[{ferrId:"corr400",form:"1"},{ferrId:"pux128",form:"1"}]},
  },
  {
    id:"arm_baixo", nome:"Armário Baixo / Balcão", desc:"Bancada, balcão cozinha/banheiro",
    cat:"caixaria", coef:0.9,
    internas:[
      {id:"le",nome:"Lateral Esquerda",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"ld",nome:"Lateral Direita",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"tp",nome:"Topo",calc:"Li*P",mat:"mdf18",fita:["f"]},
      {id:"bs",nome:"Base",calc:"Li*P",mat:"mdf18",fita:["f"]},
      {id:"fn",nome:"Fundo",calc:"Li*Ai",mat:"comp3",fita:[]},
    ],
    externas:[
      {id:"te",nome:"Tamp. Lat. Esquerda",face:"lat_esq",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"td",nome:"Tamp. Lat. Direita",face:"lat_dir",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"tb",nome:"Rodapé",face:"base",calc:"L*100",mat:"mdf18",fita:["f"]},
    ],
    subs:[{id:"prat",nome:"Prateleira",calc:"Li*Pi",mat:"mdf18",fita:["f"],tipo:"peca",max:10}],
    porta:{calc:"Lp*Ap",mat:"mdf18",fita:["all"],regras:[
      {ferrId:"dob110",form:"Ap<=800?2:3"},{ferrId:"pux128",form:"1"},
    ]},
    gaveta:{alt:150,pecas:[
      {nome:"Frente Gaveta",calc:"Lg*Ag",mat:"mdf18",fita:["all"]},
      {nome:"Lateral Gaveta",calc:"Pg*Ag",mat:"mdf15",fita:["t"],mult:2},
      {nome:"Traseira Gaveta",calc:"Lg*(Ag-15)",mat:"mdf15",fita:[]},
      {nome:"Fundo Gaveta",calc:"Lg*Pg",mat:"comp3",fita:[]},
    ],regras:[{ferrId:"corr400",form:"1"},{ferrId:"pux128",form:"1"}]},
  },
  {
    id:"aereo", nome:"Aéreo", desc:"Módulo suspenso — cozinha, lavanderia",
    cat:"caixaria", coef:0.85,
    internas:[
      {id:"le",nome:"Lateral Esquerda",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"ld",nome:"Lateral Direita",calc:"A*P",mat:"mdf18",fita:["f"]},
      {id:"tp",nome:"Topo",calc:"Li*P",mat:"mdf18",fita:["f"]},
      {id:"bs",nome:"Base",calc:"Li*P",mat:"mdf18",fita:["f","b"]},
      {id:"fn",nome:"Fundo",calc:"Li*Ai",mat:"comp3",fita:[]},
    ],
    externas:[
      {id:"te",nome:"Acab. Lat. Esq.",face:"lat_esq",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"td",nome:"Acab. Lat. Dir.",face:"lat_dir",calc:"A*P",mat:"mdf18",fita:["f","b"]},
      {id:"tb",nome:"Acab. Inferior",face:"base",calc:"L*P",mat:"mdf18",fita:["f"]},
    ],
    subs:[{id:"prat",nome:"Prateleira",calc:"Li*Pi",mat:"mdf18",fita:["f"],tipo:"peca",max:5}],
    porta:{calc:"Lp*Ap",mat:"mdf18",fita:["all"],regras:[{ferrId:"dob110",form:"2"},{ferrId:"pux128",form:"1"}]},
    gaveta:{alt:120,pecas:[],regras:[]},
  },
  {
    id:"ripado", nome:"Painel Ripado", desc:"Painel decorativo com ripas configuráveis",
    cat:"especial", coef:1.5,
    internas:[{id:"base",nome:"Base do Painel",calc:"L*A",mat:"mdf15",fita:[]}],
    externas:[],
    subs:[],
    porta:{calc:"",mat:"",fita:[],regras:[]},
    gaveta:{alt:0,pecas:[],regras:[]},
    ripado:{largR:40,espac:20,matR:"mdf18"},
  },
];

// ═══════════════════════════════════════════════════════
// MOTOR PARAMÉTRICO
// ═══════════════════════════════════════════════════════
function rCalc(expr, d) {
  try {
    let e = expr;
    // Order matters: longer tokens first
    ["Li","Ai","Pi","Lp","Ap","Lg","Ag","Pg","L","A","P"].forEach(k => {
      e = e.replace(new RegExp(k,"g"), d[k]||0);
    });
    return Function('"use strict";return('+e+')')();
  } catch { return 0; }
}
function rFerrForm(expr, d) {
  try {
    let e = expr;
    ["Ap","Ag","Lp"].forEach(k => { e = e.replace(new RegExp(k,"g"), d[k]||0); });
    return Math.ceil(Function('"use strict";return('+e+')')());
  } catch { return 1; }
}
function cFita(cfg, w, h) {
  if(!cfg||!cfg.length) return 0;
  let t=0;
  cfg.forEach(s => {
    if(s==="f") t+=w; else if(s==="t"||s==="b") t+=w;
    else if(s==="all") t+=(w+h)*2;
  });
  return t/1000;
}
function cRipado(cfg, L, A) {
  const q = Math.floor((L+cfg.espac)/(cfg.largR+cfg.espac));
  const lr = q*cfg.largR + (q-1)*cfg.espac;
  return {q, lr, sobra:(L-lr)/2, areaR:(q*cfg.largR*A)/1e6, fitaR:(q*A*2)/1000, comp:A};
}

function calcMod(mod) {
  const {dims,acabInt,acabExt,faces,nPortas,nGav,altGav,subQtd,tpl,ripCfg,qtd} = mod;
  const L=dims.l, A=dims.a, P=dims.p;
  const esp = DB_CHAPAS.find(c=>c.id===(tpl.internas[0]?.mat||"mdf18"))?.esp||18;
  const Li=L-esp*2, Ai=A-esp*2, Pi=P;
  const Lp=nPortas>0?L/nPortas:L, Ap=A;
  const Ag=altGav||150, Lg=Li, Pg=Pi-50;
  const D={L,A,P,Li,Ai,Pi,Lp,Ap,Lg,Ag,Pg};

  let pecas=[], chapas={}, fita=0, ferrList=[], custo=0, area=0;
  const addChapa=(matId,a)=>{ const m=DB_CHAPAS.find(c=>c.id===matId); if(!m)return; if(!chapas[matId])chapas[matId]={mat:m,area:0}; chapas[matId].area+=a; };

  // INTERNAS
  tpl.internas.forEach(p=>{
    const amm=rCalc(p.calc,D); const am=amm/1e6;
    const w=Math.max(Math.sqrt(amm*(L>A?L/A:1)),1); const h=amm/w;
    const f=cFita(p.fita,w,h);
    pecas.push({nome:p.nome,tipo:"int",area:am,matId:p.mat,fita:f});
    area+=am; fita+=f; addChapa(p.mat,am);
  });

  // EXTERNAS (tamponamentos)
  tpl.externas.forEach(p=>{
    if(!faces[p.face]) return;
    const amm=rCalc(p.calc,D); const am=amm/1e6;
    const w=Math.sqrt(amm); const f=cFita(p.fita,w,w);
    pecas.push({nome:p.nome,tipo:"ext",face:p.face,area:am,matId:p.mat,fita:f});
    area+=am; fita+=f; addChapa(p.mat,am);
    if(acabExt){ const ac=DB_ACABAMENTOS.find(x=>x.id===acabExt); if(ac&&ac.preco>0) custo+=am*ac.preco; }
  });

  // Acabamento interno
  if(acabInt){ const ac=DB_ACABAMENTOS.find(x=>x.id===acabInt); if(ac&&ac.preco>0){ const ai=pecas.filter(p=>p.tipo==="int").reduce((s,p)=>s+p.area,0); custo+=ai*ac.preco; }}

  // SUB-ITENS
  tpl.subs.forEach(s=>{
    const q=subQtd[s.id]||0; if(q<=0) return;
    if(s.tipo==="ferr"){ const f=DB_FERRAGENS.find(x=>x.id===s.ferrId); if(f){ const m=s.calcM?rCalc(s.calcM,D)/1000:1; ferrList.push({...f,qtd:m*q,orig:s.nome}); }}
    else { const amm=rCalc(s.calc,D); const am=(amm/1e6)*q; const w=Math.sqrt(amm); const f=cFita(s.fita,w,w)*q; pecas.push({nome:`${s.nome} (×${q})`,tipo:"sub",area:am,matId:s.mat,fita:f}); area+=am; fita+=f; addChapa(s.mat,am); }
  });

  // PORTAS
  if(nPortas>0 && tpl.porta.calc){
    const amm=rCalc(tpl.porta.calc,D); const am=(amm/1e6)*nPortas;
    const f=cFita(tpl.porta.fita,Lp,Ap)*nPortas;
    pecas.push({nome:`Porta (×${nPortas})`,tipo:"porta",area:am,matId:tpl.porta.mat,fita:f});
    area+=am; fita+=f; addChapa(tpl.porta.mat,am);
    tpl.porta.regras.forEach(r=>{ const fe=DB_FERRAGENS.find(x=>x.id===r.ferrId); if(fe){ const qp=rFerrForm(r.form,D); ferrList.push({...fe,qtd:qp*nPortas,orig:"Porta",regra:r.form}); }});
  }

  // GAVETAS
  if(nGav>0 && tpl.gaveta.pecas.length>0){
    tpl.gaveta.pecas.forEach(gp=>{
      const amm=rCalc(gp.calc,D); const mult=gp.mult||1; const am=(amm/1e6)*nGav*mult;
      const w=Math.sqrt(amm); const f=cFita(gp.fita,w,w)*nGav*mult;
      pecas.push({nome:`${gp.nome} (×${nGav*mult})`,tipo:"gav",area:am,matId:gp.mat,fita:f});
      area+=am; fita+=f; addChapa(gp.mat,am);
    });
    tpl.gaveta.regras.forEach(r=>{ const fe=DB_FERRAGENS.find(x=>x.id===r.ferrId); if(fe){ const qg=rFerrForm(r.form,D); ferrList.push({...fe,qtd:qg*nGav,orig:"Gaveta"}); }});
  }

  // RIPADO
  let rip=null;
  if(tpl.cat==="especial" && ripCfg){
    rip=cRipado(ripCfg,L,A);
    addChapa(ripCfg.matR,rip.areaR); area+=rip.areaR; fita+=rip.fitaR;
  }

  // CONSOLIDAR CHAPAS (15% perda)
  Object.values(chapas).forEach(c=>{ const ac=(c.mat.larg*c.mat.alt)/1e6; c.n=Math.ceil(c.area/(ac*0.85)); custo+=c.n*c.mat.preco; });
  custo += fita*(DB_FITAS[0]?.preco||0.85);
  ferrList.forEach(f=>custo+=f.preco*f.qtd);

  return {pecas,chapas,fita,ferrList,custo,area,rip};
}

// MARKUP DIVISOR
function precoVenda(custoBase, taxas) {
  const s=(taxas.imp+taxas.com+taxas.mont+taxas.lucro+taxas.frete)/100;
  return s>=1 ? custoBase*3 : custoBase/(1-s);
}

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const KCOLS=[
  {id:"lead",nm:"Primeiro Contato",c:"#7e7ec8"},
  {id:"orc",nm:"Em Orçamento",c:"#c8a97e"},
  {id:"env",nm:"Proposta Enviada",c:"#c8c87e"},
  {id:"neg",nm:"Negociação",c:"#c87eb8"},
  {id:"ok",nm:"Aprovado",c:"#8fbc8f"},
  {id:"prod",nm:"Em Produção",c:"#7eb8c8"},
  {id:"done",nm:"Entregue",c:"#6a9"},
];
const init={
  pg:"dash",sb:true,
  clis:[
    {id:"c1",nome:"Maria Silva",tel:"(98)99999-1111",email:"maria@email.com",arq:"",cidade:"São Luís"},
    {id:"c2",nome:"João Santos",tel:"(98)99999-2222",email:"joao@email.com",arq:"Arq. Ana Costa",cidade:"São Luís"},
  ],
  orcs:[],orcAt:null,
  tx:{imp:8,com:10,mont:12,lucro:20,frete:2,mdo:350,inst:180},
  notif:null,kb:{},
};
function red(s,a){
  switch(a.t){
    case"NAV":return{...s,pg:a.p};
    case"SB":return{...s,sb:!s.sb};
    case"NT":return{...s,notif:a.m};
    case"CN":return{...s,notif:null};
    case"AC":return{...s,clis:[...s.clis,{...a.d,id:uid()}]};
    case"UC":return{...s,clis:s.clis.map(c=>c.id===a.d.id?a.d:c)};
    case"DC":return{...s,clis:s.clis.filter(c=>c.id!==a.id)};
    case"SO":{const e=s.orcs.find(o=>o.id===a.d.id);return e?{...s,orcs:s.orcs.map(o=>o.id===a.d.id?a.d:o),orcAt:a.d}:{...s,orcs:[...s.orcs,a.d],orcAt:a.d};}
    case"DO":return{...s,orcs:s.orcs.filter(o=>o.id!==a.id)};
    case"SA":return{...s,orcAt:a.d};
    case"UT":return{...s,tx:{...s.tx,...a.d}};
    case"MK":return{...s,kb:{...s.kb,[a.oid]:a.col}};
    default:return s;
  }
}

// ═══════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════
const Ic={
  Dash:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Usr:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  Box:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  File:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
  Calc:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="18" x2="16" y2="18"/></svg>,
  Kb:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/></svg>,
  Gear:()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Menu:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  X:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Plus:()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Edit:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Copy:()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  Chev:()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
};

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════
const Z={
  inp:{background:"#0b0b0b",border:"1px solid #1c1c1c",color:"#ccc",padding:"7px 10px",borderRadius:2,width:"100%",boxSizing:"border-box",fontFamily:"inherit",fontSize:12},
  btn:{background:"#B8956A",color:"#070707",border:"none",padding:"7px 16px",borderRadius:2,cursor:"pointer",fontWeight:600,fontSize:11,fontFamily:"inherit"},
  btn2:{background:"transparent",color:"#666",border:"1px solid #222",padding:"7px 14px",borderRadius:2,cursor:"pointer",fontSize:11,fontFamily:"inherit"},
  btnD:{background:"transparent",color:"#d46b6b",border:"1px solid #361818",padding:"5px 10px",borderRadius:2,cursor:"pointer",fontSize:10,fontFamily:"inherit"},
  card:{background:"#0d0d0d",border:"1px solid #161616",borderRadius:3,padding:16},
  h1:{fontFamily:"'Playfair Display',Georgia,serif",fontSize:20,fontWeight:700,color:"#f0f0f0",marginBottom:2},
  sub:{fontSize:11,color:"#444",marginBottom:20},
  lbl:{fontSize:9,color:"#505050",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:3,display:"block"},
  th:{background:"#080808",borderBottom:"1px solid #161616",color:"#505050",fontSize:9,textTransform:"uppercase",letterSpacing:"1px"},
  pg:{padding:"20px 26px"},
  tag:c=>({fontSize:8,background:c+"15",color:c,padding:"2px 7px",borderRadius:10,fontWeight:600,letterSpacing:"0.5px",display:"inline-block"}),
};

function Modal({title,close,children,w=500}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={close}>
    <div style={{background:"#0d0d0d",border:"1px solid #1c1c1c",borderRadius:4,width:w,maxWidth:"92vw",maxHeight:"88vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #141414"}}>
        <span style={{fontFamily:"'Playfair Display',serif",fontWeight:600,fontSize:14,color:"#eee"}}>{title}</span>
        <button onClick={close} style={{background:"none",border:"none",color:"#444",cursor:"pointer"}}><Ic.X/></button>
      </div>
      <div style={{padding:16}}>{children}</div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App(){
  const[s,d]=useReducer(red,init);
  useEffect(()=>{if(s.notif){const t=setTimeout(()=>d({t:"CN"}),3e3);return()=>clearTimeout(t);}},[s.notif]);
  const nav=p=>d({t:"NAV",p});
  const mn=[{id:"dash",lb:"Dashboard",ic:Ic.Dash},{id:"cli",lb:"Clientes",ic:Ic.Usr},{id:"cat",lb:"Catálogo Módulos",ic:Ic.Box},{id:"orcs",lb:"Orçamentos",ic:Ic.File},{id:"novo",lb:"Novo Orçamento",ic:Ic.Calc},{id:"kb",lb:"Pipeline CRM",ic:Ic.Kb},{id:"cfg",lb:"Config & Taxas",ic:Ic.Gear}];
  const pg=()=>{switch(s.pg){
    case"dash":return<Dash s={s} d={d} nav={nav}/>;case"cli":return<Cli s={s} d={d}/>;case"cat":return<Cat s={s}/>;
    case"orcs":return<Orcs s={s} d={d} nav={nav}/>;case"novo":return<Novo s={s} d={d} nav={nav}/>;
    case"kb":return<Kb s={s} d={d}/>;case"cfg":return<Cfg s={s} d={d}/>;default:return<Dash s={s} d={d} nav={nav}/>;
  }};
  return<div style={{display:"flex",height:"100vh",fontFamily:"'IBM Plex Mono','Menlo',monospace",background:"#070707",color:"#d0d0d0",fontSize:12,overflow:"hidden"}}>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet"/>
    <aside style={{width:s.sb?210:48,background:"#090909",borderRight:"1px solid #121212",transition:"width .2s",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
      <div style={{padding:12,borderBottom:"1px solid #121212",display:"flex",alignItems:"center",gap:8,minHeight:44}}>
        <button onClick={()=>d({t:"SB"})} style={{background:"none",border:"none",color:"#505050",cursor:"pointer",padding:2}}><Ic.Menu/></button>
        {s.sb&&<div><div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:13,color:"#B8956A"}}>MARCENARIA</div><div style={{fontSize:7,color:"#333",letterSpacing:"2.5px",marginTop:1}}>ERP · CRM · v2</div></div>}
      </div>
      <nav style={{flex:1,padding:"4px 0"}}>{mn.map(m=>{const a=s.pg===m.id;const I=m.ic;return<button key={m.id} onClick={()=>nav(m.id)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:s.sb?"8px 12px":"8px 14px",background:a?"rgba(184,149,106,.06)":"transparent",border:"none",borderLeft:a?"2px solid #B8956A":"2px solid transparent",color:a?"#B8956A":"#505050",cursor:"pointer",fontSize:11,textAlign:"left",fontFamily:"inherit",transition:"all .1s"}}><I/>{s.sb&&<span>{m.lb}</span>}</button>;})}</nav>
    </aside>
    <main style={{flex:1,overflow:"auto",position:"relative"}}>
      {s.notif&&<div style={{position:"fixed",top:12,right:12,zIndex:1e3,background:"#0d1e0d",border:"1px solid #1e3e1e",color:"#7eb87e",padding:"8px 16px",borderRadius:2,fontSize:11}}>{s.notif}</div>}
      {pg()}
    </main>
    <style>{`input,select,textarea{font-family:'IBM Plex Mono',monospace;font-size:12px}input:focus,select:focus,textarea:focus{outline:none;border-color:#B8956A!important}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#070707}::-webkit-scrollbar-thumb{background:#191919;border-radius:3px}`}</style>
  </div>;
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
function Dash({s,d,nav}){
  const tv=s.orcs.reduce((a,o)=>a+(o.vf||0),0);
  const cs=[{l:"Orçamentos",v:s.orcs.length,c:"#B8956A"},{l:"Clientes",v:s.clis.length,c:"#7eb87e"},{l:"Em Produção",v:Object.values(s.kb).filter(v=>v==="prod").length,c:"#7eb8c8"},{l:"Faturamento",v:R$(tv),c:"#b87ec8"}];
  return<div style={Z.pg}>
    <div style={Z.h1}>Dashboard</div><div style={Z.sub}>Visão geral</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:24}}>
      {cs.map((c,i)=><div key={i} style={{...Z.card,borderTop:`2px solid ${c.c}`}}>
        <div style={{fontSize:9,color:"#3a3a3a",textTransform:"uppercase",letterSpacing:"1px",marginBottom:5}}>{c.l}</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:700,color:c.c}}>{c.v}</div>
      </div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={Z.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#eee",marginBottom:12,fontFamily:"'Playfair Display',serif"}}>Ações Rápidas</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={()=>nav("novo")} style={{...Z.btn,textAlign:"center",padding:10}}>+ Novo Orçamento</button>
          <button onClick={()=>nav("cli")} style={{...Z.btn2,textAlign:"center",padding:10}}>+ Novo Cliente</button>
          <button onClick={()=>nav("kb")} style={{...Z.btn2,textAlign:"center",padding:10}}>Pipeline CRM</button>
        </div>
      </div>
      <div style={Z.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#eee",marginBottom:12,fontFamily:"'Playfair Display',serif"}}>Últimos Orçamentos</div>
        {s.orcs.length===0?<div style={{color:"#2a2a2a",textAlign:"center",padding:18,fontSize:11}}>Nenhum</div>:
          s.orcs.slice(-5).reverse().map(o=><div key={o.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",background:"#080808",borderRadius:2,marginBottom:3,fontSize:11}}>
            <span style={{color:"#888"}}>{o.cn} — {o.amb}</span><span style={{color:"#B8956A",fontWeight:600}}>{R$(o.vf)}</span>
          </div>)}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════
function Cli({s,d}){
  const[f,sf]=useState({nome:"",tel:"",email:"",arq:"",cidade:""});
  const[ed,se]=useState(null);const[mo,sm]=useState(false);const[sr,ssr]=useState("");
  const fl=s.clis.filter(c=>c.nome.toLowerCase().includes(sr.toLowerCase())||c.tel.includes(sr));
  const sv=()=>{if(!f.nome)return;if(ed){d({t:"UC",d:{...f,id:ed}});}else{d({t:"AC",d:f});}d({t:"NT",m:"Salvo!"});sf({nome:"",tel:"",email:"",arq:"",cidade:""});se(null);sm(false);};
  return<div style={Z.pg}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}><div><div style={Z.h1}>Clientes</div><div style={Z.sub}>{s.clis.length} cadastrados</div></div>
      <button onClick={()=>{sf({nome:"",tel:"",email:"",arq:"",cidade:""});se(null);sm(true);}} style={Z.btn}><Ic.Plus/> Novo</button></div>
    <input placeholder="Buscar..." value={sr} onChange={e=>ssr(e.target.value)} style={{...Z.inp,maxWidth:260,marginBottom:12}}/>
    <div style={Z.card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Nome","Telefone","Email","Arq./Designer",""].map(h=><th key={h} style={{...Z.th,padding:"7px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
      <tbody>{fl.map(c=><tr key={c.id} style={{borderBottom:"1px solid #111"}}>
        <td style={{padding:"7px 8px",color:"#ccc"}}>{c.nome}</td><td style={{padding:"7px 8px",color:"#666"}}>{c.tel}</td>
        <td style={{padding:"7px 8px",color:"#666"}}>{c.email}</td><td style={{padding:"7px 8px",color:"#666"}}>{c.arq||"—"}</td>
        <td style={{padding:"7px 8px"}}><div style={{display:"flex",gap:4}}>
          <button onClick={()=>{sf(c);se(c.id);sm(true);}} style={{...Z.btn2,padding:"3px 6px"}}><Ic.Edit/></button>
          <button onClick={()=>{d({t:"DC",id:c.id});d({t:"NT",m:"Removido"});}} style={{...Z.btnD,padding:"3px 6px"}}><Ic.Trash/></button>
        </div></td></tr>)}</tbody></table>
      {fl.length===0&&<div style={{textAlign:"center",padding:30,color:"#2a2a2a"}}>Nenhum</div>}</div>
    {mo&&<Modal title={ed?"Editar":"Novo Cliente"} close={()=>sm(false)}>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <div><label style={Z.lbl}>Nome *</label><input value={f.nome} onChange={e=>sf({...f,nome:e.target.value})} style={Z.inp}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <div><label style={Z.lbl}>Telefone</label><input value={f.tel} onChange={e=>sf({...f,tel:e.target.value})} style={Z.inp}/></div>
          <div><label style={Z.lbl}>Email</label><input value={f.email} onChange={e=>sf({...f,email:e.target.value})} style={Z.inp}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <div><label style={Z.lbl}>Cidade</label><input value={f.cidade} onChange={e=>sf({...f,cidade:e.target.value})} style={Z.inp}/></div>
          <div><label style={Z.lbl}>Arquiteto/Designer</label><input value={f.arq} onChange={e=>sf({...f,arq:e.target.value})} style={Z.inp}/></div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:6}}>
          <button onClick={()=>sm(false)} style={Z.btn2}>Cancelar</button><button onClick={sv} style={Z.btn}>{ed?"Salvar":"Cadastrar"}</button>
        </div>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════
// CATÁLOGO
// ═══════════════════════════════════════════════════════
function Cat({s}){
  const[exp,se]=useState(null);
  const cc=c=>c==="caixaria"?"#B8956A":"#b87ec8";
  return<div style={Z.pg}>
    <div style={Z.h1}>Catálogo de Módulos</div>
    <div style={Z.sub}>Peças internas (obrigatórias) e externas (tamponamentos opcionais)</div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {CATALOGO.map(m=><div key={m.id} style={{...Z.card,borderLeft:`3px solid ${cc(m.cat)}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>se(exp===m.id?null:m.id)}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontWeight:600,color:"#eee",fontSize:13}}>{m.nome}</span>
            <span style={Z.tag(cc(m.cat))}>{m.cat.toUpperCase()}</span>
            <span style={{fontSize:10,color:"#3a3a3a"}}>Coef. {m.coef}×</span>
          </div>
          <div style={{transform:exp===m.id?"rotate(180deg)":"",transition:".2s",color:"#3a3a3a"}}><Ic.Chev/></div>
        </div>
        <div style={{fontSize:10,color:"#444",marginTop:2}}>{m.desc}</div>
        {exp===m.id&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #141414"}}>
          <div style={{fontSize:9,color:"#B8956A",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:5,fontWeight:600}}>■ INTERNAS (Obrigatórias)</div>
          {m.internas.map((p,i)=><div key={i} style={{display:"flex",gap:8,padding:"4px 6px",background:"#080808",borderRadius:2,marginBottom:2,fontSize:10}}>
            <span style={{color:"#ccc",minWidth:150}}>{p.nome}</span><span style={{color:"#3a3a3a"}}>{p.calc}</span><span style={{color:"#7eb8c8"}}>{DB_CHAPAS.find(c=>c.id===p.mat)?.nome}</span>
          </div>)}
          {m.externas.length>0&&<><div style={{fontSize:9,color:"#b87ec8",textTransform:"uppercase",letterSpacing:"1.2px",margin:"10px 0 5px",fontWeight:600}}>◆ EXTERNAS (Tamponamentos — opcionais)</div>
          {m.externas.map((p,i)=><div key={i} style={{display:"flex",gap:8,padding:"4px 6px",background:"#080808",borderRadius:2,marginBottom:2,fontSize:10,borderLeft:"2px solid #2a1a2e"}}>
            <span style={{color:"#ccc",minWidth:150}}>{p.nome}</span><span style={{color:"#555"}}>Face: {p.face}</span><span style={{fontSize:8,color:"#666",background:"#111",padding:"1px 4px",borderRadius:6}}>ativa = tamponamento</span>
          </div>)}</>}
          {m.subs.length>0&&<><div style={{fontSize:9,color:"#7eb87e",textTransform:"uppercase",letterSpacing:"1.2px",margin:"10px 0 5px",fontWeight:600}}>○ SUB-ITENS</div>
          {m.subs.map((sub,i)=><div key={i} style={{display:"flex",gap:8,padding:"4px 6px",background:"#080808",borderRadius:2,marginBottom:2,fontSize:10,borderLeft:"2px solid #1a2e1a"}}>
            <span style={{color:"#ccc",minWidth:130}}>{sub.nome}</span><span style={Z.tag(sub.tipo==="ferr"?"#b87ec8":"#7eb8c8")}>{sub.tipo}</span><span style={{color:"#3a3a3a"}}>Max: {sub.max}</span>
          </div>)}</>}
          {m.porta.calc&&<><div style={{fontSize:9,color:"#c8a97e",textTransform:"uppercase",letterSpacing:"1.2px",margin:"10px 0 5px",fontWeight:600}}>▸ PORTAS — Regras de Ferragem</div>
          {m.porta.regras.map((r,i)=>{const fe=DB_FERRAGENS.find(x=>x.id===r.ferrId);return<div key={i} style={{fontSize:10,padding:"3px 6px",background:"#080808",borderRadius:2,marginBottom:2}}>
            <span style={{color:"#ccc"}}>{fe?.nome}: </span><span style={{color:"#B8956A",fontFamily:"inherit"}}>Qtd = {r.form}</span>
          </div>;})}</>}
          {m.ripado&&<div style={{marginTop:8,fontSize:10,color:"#b87ec8"}}>Ripado: {m.ripado.largR}mm larg × {m.ripado.espac}mm espaç.</div>}
        </div>}
      </div>)}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════
// NOVO ORÇAMENTO
// ═══════════════════════════════════════════════════════
function Novo({s,d,nav}){
  const[step,ss]=useState(1);
  const[cid,sc]=useState(s.orcAt?.cid||"");
  const[amb,sa]=useState(s.orcAt?.amb||"");
  const[mods,sm]=useState(s.orcAt?.mods||[]);
  const[obs,so]=useState(s.orcAt?.obs||"");

  const add=tid=>{const tpl=CATALOGO.find(m=>m.id===tid);if(!tpl)return;sm([...mods,{
    id:uid(),tpl:JSON.parse(JSON.stringify(tpl)),
    dims:{l:600,a:2100,p:500},acabInt:"bp_branco",acabExt:"",faces:{},
    nPortas:0,nGav:0,altGav:tpl.gaveta?.alt||150,subQtd:{},
    ripCfg:tpl.ripado?{...tpl.ripado}:null,qtd:1,
  }]);};
  const up=(i,fn)=>{const m=[...mods];fn(m[i]);sm(m);};

  const tot=useMemo(()=>{
    let cm=0,at=0,ft=0;const ca={},fa={};
    const det=mods.map(mod=>{
      const r=calcMod(mod);
      const cc=r.custo*mod.tpl.coef*(mod.qtd||1);
      cm+=cc;at+=r.area*(mod.qtd||1);ft+=r.fita*(mod.qtd||1);
      Object.entries(r.chapas).forEach(([id,c])=>{if(!ca[id])ca[id]={mat:c.mat,area:0,n:0};ca[id].area+=c.area*(mod.qtd||1);const ac=(c.mat.larg*c.mat.alt)/1e6;ca[id].n=Math.ceil(ca[id].area/(ac*0.85));});
      r.ferrList.forEach(f=>{const k=f.id;if(!fa[k])fa[k]={...f,qtd:0};fa[k].qtd+=f.qtd*(mod.qtd||1);});
      return{mod,r,cc};
    });
    const cb=cm+(at*s.tx.mdo)+(at*s.tx.inst);
    const pv=precoVenda(cb,s.tx);
    return{cm,at,ft,ca,fa,det,cb,pv};
  },[mods,s.tx]);

  const salvar=()=>{
    const cl=s.clis.find(c=>c.id===cid);
    d({t:"SO",d:{id:s.orcAt?.id||uid(),cid,cn:cl?.nome||"—",amb,mods,obs,dt:new Date().toLocaleDateString("pt-BR"),cm:tot.cm,vf:tot.pv,st:"rascunho"}});
    d({t:"NT",m:"Orçamento salvo!"});
  };

  return<div style={Z.pg}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
      <div><div style={Z.h1}>{s.orcAt?"Editar":"Novo"} Orçamento</div><div style={Z.sub}>Precificação por Markup Divisor</div></div>
      <button onClick={()=>{d({t:"SA",d:null});nav("orcs");}} style={Z.btn2}>← Voltar</button>
    </div>
    {/* Steps */}
    <div style={{display:"flex",gap:0,marginBottom:24}}>
      {["Cliente & Ambiente","Módulos & Acabamentos","Revisão & Preço"].map((t,i)=><div key={i} style={{flex:1,display:"flex",alignItems:"center",gap:7,padding:"9px 12px",background:step===i+1?"rgba(184,149,106,.05)":"transparent",borderBottom:step===i+1?"2px solid #B8956A":"2px solid #121212",cursor:"pointer"}} onClick={()=>ss(i+1)}>
        <span style={{width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:step>i+1||step===i+1?"#B8956A":"#181818",color:step>=i+1?"#070707":"#3a3a3a",fontSize:9,fontWeight:700}}>{step>i+1?"✓":i+1}</span>
        <span style={{color:step===i+1?"#B8956A":"#3a3a3a",fontSize:11}}>{t}</span>
      </div>)}
    </div>

    {/* STEP 1 */}
    {step===1&&<div style={Z.card}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div><label style={Z.lbl}>Cliente *</label><select value={cid} onChange={e=>sc(e.target.value)} style={Z.inp}><option value="">Selecione...</option>{s.clis.map(c=><option key={c.id} value={c.id}>{c.nome}{c.arq?` (${c.arq})`:""}</option>)}</select></div>
        <div><label style={Z.lbl}>Ambiente</label><input value={amb} onChange={e=>sa(e.target.value)} placeholder="Quarto, Cozinha..." style={Z.inp}/></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button onClick={()=>ss(2)} style={Z.btn}>Próximo →</button></div>
    </div>}

    {/* STEP 2 — MÓDULOS */}
    {step===2&&<div>
      <div style={{...Z.card,marginBottom:12,display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
        <span style={{...Z.lbl,marginBottom:0,marginRight:4}}>Adicionar:</span>
        {CATALOGO.map(t=><button key={t.id} onClick={()=>add(t.id)} style={{...Z.btn2,padding:"4px 9px",fontSize:10,borderColor:t.cat==="especial"?"#2a1a2e":"#222",color:t.cat==="especial"?"#b87ec8":"#888"}}>+ {t.nome}</button>)}
      </div>
      {mods.length===0?<div style={{...Z.card,textAlign:"center",padding:44,color:"#2a2a2a"}}>Adicione módulos acima</div>:
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {mods.map((mod,idx)=>{
          const res=calcMod(mod);const tpl=mod.tpl;
          return<div key={mod.id} style={{...Z.card,borderLeft:`3px solid ${tpl.cat==="especial"?"#b87ec8":"#B8956A"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:9,color:"#2a2a2a",fontWeight:700}}>#{idx+1}</span>
                <span style={{fontFamily:"'Playfair Display',serif",fontWeight:600,color:"#eee",fontSize:13}}>{tpl.nome}</span>
                <span style={{fontSize:9,color:"#3a3a3a"}}>×{tpl.coef}</span>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>{const c=JSON.parse(JSON.stringify(mod));c.id=uid();sm([...mods,c]);}} style={{...Z.btn2,padding:"3px 5px"}}><Ic.Copy/></button>
                <button onClick={()=>sm(mods.filter((_,i)=>i!==idx))} style={{...Z.btnD,padding:"3px 5px"}}><Ic.Trash/></button>
              </div>
            </div>
            {/* Dimensões */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,marginBottom:10}}>
              <div><label style={Z.lbl}>Largura mm</label><input type="number" value={mod.dims.l} onChange={e=>up(idx,m=>m.dims.l=+e.target.value||0)} style={Z.inp}/></div>
              <div><label style={Z.lbl}>Altura mm</label><input type="number" value={mod.dims.a} onChange={e=>up(idx,m=>m.dims.a=+e.target.value||0)} style={Z.inp}/></div>
              {tpl.cat!=="especial"&&<div><label style={Z.lbl}>Profund. mm</label><input type="number" value={mod.dims.p} onChange={e=>up(idx,m=>m.dims.p=+e.target.value||0)} style={Z.inp}/></div>}
              <div><label style={Z.lbl}>Qtd</label><input type="number" value={mod.qtd} onChange={e=>up(idx,m=>m.qtd=Math.max(1,+e.target.value||1))} style={Z.inp} min={1}/></div>
            </div>

            {/* ═══ ACABAMENTOS ═══ */}
            <div style={{background:"#080808",padding:10,borderRadius:2,marginBottom:10}}>
              <div style={{fontSize:9,color:"#B8956A",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:7,fontWeight:600}}>Acabamentos</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label style={Z.lbl}>Acabamento Interno</label>
                  <select value={mod.acabInt} onChange={e=>up(idx,m=>m.acabInt=e.target.value)} style={Z.inp}>
                    <option value="">Sem especial</option>{DB_ACABAMENTOS.map(a=><option key={a.id} value={a.id}>{a.nome}{a.preco>0?` (+${R$(a.preco)}/m²)`:""}</option>)}
                  </select></div>
                <div><label style={Z.lbl}>Acabamento Externo (tamponamento)</label>
                  <select value={mod.acabExt} onChange={e=>up(idx,m=>m.acabExt=e.target.value)} style={Z.inp}>
                    <option value="">Sem acabamento externo</option>{DB_ACABAMENTOS.map(a=><option key={a.id} value={a.id}>{a.nome}{a.preco>0?` (+${R$(a.preco)}/m²)`:""}</option>)}
                  </select></div>
              </div>
              {tpl.externas.length>0&&<div>
                <label style={{...Z.lbl,marginBottom:5}}>Faces com acabamento externo (ativar = tem tamponamento)</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {tpl.externas.map(pe=>{const on=mod.faces[pe.face];
                    return<button key={pe.id} onClick={()=>up(idx,m=>{m.faces={...m.faces,[pe.face]:!on};})} style={{padding:"5px 10px",borderRadius:2,fontSize:10,cursor:"pointer",background:on?"rgba(184,126,200,.1)":"#0a0a0a",border:on?"1px solid #b87ec8":"1px solid #1a1a1a",color:on?"#b87ec8":"#555",fontFamily:"inherit",transition:"all .1s"}}>
                      {on?"✓ ":""}{pe.nome}
                    </button>;})}
                </div>
                {Object.values(mod.faces).some(v=>v)&&!mod.acabExt&&<div style={{marginTop:5,fontSize:9,color:"#d4a86b",background:"#160f05",padding:"3px 7px",borderRadius:2}}>⚠ Selecione um acabamento externo</div>}
              </div>}
            </div>

            {/* Sub-Itens */}
            {tpl.subs.length>0&&<div style={{background:"#080808",padding:10,borderRadius:2,marginBottom:10}}>
              <div style={{fontSize:9,color:"#7eb87e",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6,fontWeight:600}}>Sub-Itens</div>
              {tpl.subs.map(sub=><div key={sub.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{color:"#ccc",fontSize:11,minWidth:130}}>{sub.nome}</span>
                <label style={{...Z.lbl,marginBottom:0,fontSize:8}}>Qtd (0-{sub.max})</label>
                <input type="number" value={mod.subQtd[sub.id]||0} onChange={e=>up(idx,m=>m.subQtd={...m.subQtd,[sub.id]:clamp(+e.target.value||0,0,sub.max)})} style={{...Z.inp,width:55}} min={0} max={sub.max}/>
              </div>)}
            </div>}

            {/* Portas */}
            {tpl.porta.calc&&<div style={{background:"#080808",padding:10,borderRadius:2,marginBottom:10}}>
              <div style={{fontSize:9,color:"#c8a97e",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6,fontWeight:600}}>Portas</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div><label style={Z.lbl}>Qtd</label><input type="number" value={mod.nPortas} onChange={e=>up(idx,m=>m.nPortas=Math.max(0,+e.target.value||0))} style={{...Z.inp,width:60}} min={0}/></div>
                {mod.nPortas>0&&<div style={{fontSize:10,color:"#777"}}>
                  {tpl.porta.regras.map((r,ri)=>{const fe=DB_FERRAGENS.find(x=>x.id===r.ferrId);const np=mod.nPortas;const Lp=mod.dims.l/(np||1);const q=rFerrForm(r.form,{Ap:mod.dims.a,Ag:0,Lp});return<div key={ri}>→ {fe?.nome}: <span style={{color:"#B8956A"}}>{q}×{np} = {q*np}</span></div>;})}
                </div>}
              </div>
            </div>}

            {/* Gavetas */}
            {tpl.gaveta.pecas.length>0&&<div style={{background:"#080808",padding:10,borderRadius:2,marginBottom:10}}>
              <div style={{fontSize:9,color:"#7eb8c8",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6,fontWeight:600}}>Gavetas</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div><label style={Z.lbl}>Qtd</label><input type="number" value={mod.nGav} onChange={e=>up(idx,m=>m.nGav=Math.max(0,+e.target.value||0))} style={{...Z.inp,width:60}} min={0}/></div>
                <div><label style={Z.lbl}>Altura Gaveta mm</label><input type="number" value={mod.altGav} onChange={e=>up(idx,m=>m.altGav=+e.target.value||150)} style={{...Z.inp,width:80}}/></div>
              </div>
            </div>}

            {/* Ripado */}
            {mod.ripCfg&&<div style={{background:"#080808",padding:10,borderRadius:2,marginBottom:10}}>
              <div style={{fontSize:9,color:"#b87ec8",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6,fontWeight:600}}>Config Ripado</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                <div><label style={Z.lbl}>Larg Ripa mm</label><input type="number" value={mod.ripCfg.largR} onChange={e=>up(idx,m=>m.ripCfg.largR=+e.target.value||0)} style={Z.inp}/></div>
                <div><label style={Z.lbl}>Espaçamento mm</label><input type="number" value={mod.ripCfg.espac} onChange={e=>up(idx,m=>m.ripCfg.espac=+e.target.value||0)} style={Z.inp}/></div>
                <div><label style={Z.lbl}>Material</label><select value={mod.ripCfg.matR} onChange={e=>up(idx,m=>m.ripCfg.matR=e.target.value)} style={Z.inp}>{DB_CHAPAS.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              {mod.dims.l>0&&mod.dims.a>0&&(()=>{const rp=cRipado(mod.ripCfg,mod.dims.l,mod.dims.a);return<div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginTop:6}}>
                {[["Ripas",rp.q],["Comp",rp.comp+"mm"],["Área",N(rp.areaR)+"m²"],["Fita",N(rp.fitaR)+"m"],["Sobra/lado",N(rp.sobra,1)+"mm"]].map(([l,v],i)=><div key={i} style={{background:"#0b0b0b",padding:5,borderRadius:2,textAlign:"center"}}><div style={{fontSize:7,color:"#3a3a3a"}}>{l}</div><div style={{color:"#ccc",fontSize:10,fontWeight:600}}>{v}</div></div>)}
              </div>;})()}
            </div>}

            {/* Resumo módulo */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:5}}>
              {[["Área",N(res.area)+"m²","#ccc"],["Fita",N(res.fita)+"m","#B8956A"],["Chapas",Object.values(res.chapas).reduce((a,c)=>a+c.n,0)+"un","#7eb8c8"],["Ferragens",res.ferrList.reduce((a,f)=>a+f.qtd,0),"#b87ec8"],["Custo",R$(res.custo*tpl.coef*(mod.qtd||1)),"#B8956A"]].map(([l,v,c],i)=>
                <div key={i} style={{background:"#080808",padding:6,borderRadius:2,textAlign:"center"}}><div style={{fontSize:7,color:"#3a3a3a"}}>{l}</div><div style={{color:c,fontSize:10,fontWeight:600}}>{v}</div></div>)}
            </div>
          </div>;})}
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:16}}><button onClick={()=>ss(1)} style={Z.btn2}>← Anterior</button><button onClick={()=>ss(3)} style={Z.btn}>Próximo →</button></div>
    </div>}

    {/* STEP 3 — REVISÃO */}
    {step===3&&<div>
      <div style={{display:"grid",gridTemplateColumns:"5fr 3fr",gap:12}}>
        <div>
          {/* BOM Chapas */}
          <div style={{...Z.card,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#B8956A",marginBottom:8,fontFamily:"'Playfair Display',serif"}}>BOM — Chapas</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Material","Área","Chapas (15% perda)","Custo"].map(h=><th key={h} style={{...Z.th,padding:"6px 7px",textAlign:h==="Custo"?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{Object.entries(tot.ca).map(([id,c])=><tr key={id} style={{borderBottom:"1px solid #111"}}>
                <td style={{padding:"6px 7px",color:"#ccc"}}>{c.mat.nome}</td><td style={{padding:"6px 7px",color:"#666"}}>{N(c.area)} m²</td>
                <td style={{padding:"6px 7px",color:"#7eb8c8",fontWeight:600}}>{c.n}</td><td style={{padding:"6px 7px",color:"#B8956A",textAlign:"right"}}>{R$(c.n*c.mat.preco)}</td>
              </tr>)}</tbody></table>
          </div>
          {/* Fita */}
          <div style={{...Z.card,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#ccc"}}>Fita de Borda Total</span><span style={{color:"#B8956A",fontWeight:600}}>{N(tot.ft)} metros</span>
          </div>
          {/* Ferragens */}
          {Object.keys(tot.fa).length>0&&<div style={{...Z.card,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#b87ec8",marginBottom:8,fontFamily:"'Playfair Display',serif"}}>BOM — Ferragens</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Item","Orig","Qtd","Unit.","Total"].map(h=><th key={h} style={{...Z.th,padding:"6px 7px",textAlign:h==="Total"||h==="Unit."?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{Object.values(tot.fa).map((f,i)=><tr key={i} style={{borderBottom:"1px solid #111"}}>
                <td style={{padding:"6px 7px",color:"#ccc"}}>{f.nome}</td><td style={{padding:"6px 7px",color:"#444",fontSize:9}}>{f.orig}</td>
                <td style={{padding:"6px 7px",color:"#666"}}>{N(f.qtd,0)} {f.un}</td><td style={{padding:"6px 7px",color:"#666",textAlign:"right"}}>{R$(f.preco)}</td>
                <td style={{padding:"6px 7px",color:"#B8956A",textAlign:"right"}}>{R$(f.preco*f.qtd)}</td>
              </tr>)}</tbody></table>
          </div>}
          {/* Detalhe módulos */}
          <div style={{...Z.card,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#eee",marginBottom:8,fontFamily:"'Playfair Display',serif"}}>Peças por Módulo</div>
            {tot.det.map((dt,i)=><div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #111"}}>
              <div style={{fontSize:10,fontWeight:600,color:"#B8956A",marginBottom:3}}>#{i+1} {dt.mod.tpl.nome} — {dt.mod.dims.l}×{dt.mod.dims.a}×{dt.mod.dims.p||0}mm</div>
              {dt.r.pecas.map((p,pi)=><div key={pi} style={{display:"flex",gap:8,fontSize:9,padding:"1px 0",color:"#777"}}>
                <span style={{color:p.tipo==="int"?"#B8956A":p.tipo==="ext"?"#b87ec8":p.tipo==="porta"?"#c8a97e":"#7eb87e",width:7}}>
                  {p.tipo==="int"?"■":p.tipo==="ext"?"◆":"○"}</span>
                <span style={{minWidth:170,color:"#ccc"}}>{p.nome}</span><span>{N(p.area,4)}m²</span>
                {p.fita>0&&<span style={{color:"#B8956A"}}>Fita:{N(p.fita)}m</span>}
              </div>)}
            </div>)}
          </div>
          <div style={Z.card}><label style={Z.lbl}>Observações</label><textarea value={obs} onChange={e=>so(e.target.value)} style={{...Z.inp,height:60,resize:"vertical"}}/></div>
        </div>
        {/* FINANCEIRO */}
        <div><div style={{...Z.card,position:"sticky",top:20,borderTop:"2px solid #B8956A"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:"#eee",marginBottom:14}}>Markup Divisor</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {[["Custo Material",R$(tot.cm)],["Mão de Obra ("+N(tot.at)+"m²)",R$(tot.at*s.tx.mdo)],["Instalação",R$(tot.at*s.tx.inst)]].map(([l,v],i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"#666"}}>{l}</span><span style={{color:"#ccc"}}>{v}</span></div>)}
            <div style={{borderTop:"1px solid #181818",paddingTop:7,display:"flex",justifyContent:"space-between",fontSize:11}}>
              <span style={{color:"#999"}}>Custo Produção</span><span style={{color:"#eee",fontWeight:600}}>{R$(tot.cb)}</span>
            </div>
            <div style={{borderTop:"1px solid #181818",paddingTop:7,fontSize:9,color:"#444"}}>
              <div style={{marginBottom:3,fontWeight:600,color:"#666"}}>Preço = Custo / (1 − Σ taxas)</div>
              {[["Impostos",s.tx.imp],["Comissão Arq.",s.tx.com],["Montagem",s.tx.mont],["Lucro Líquido",s.tx.lucro],["Frete",s.tx.frete]].map(([l,v],i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}><span>{l}</span><span style={{color:"#B8956A"}}>{v}%</span></div>)}
              <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #181818",marginTop:3,paddingTop:3}}><span style={{fontWeight:600}}>Σ Taxas</span><span style={{color:"#d46b6b",fontWeight:600}}>{s.tx.imp+s.tx.com+s.tx.mont+s.tx.lucro+s.tx.frete}%</span></div>
            </div>
            <div style={{borderTop:"2px solid #B8956A",paddingTop:12,marginTop:4,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:14,color:"#eee"}}>PREÇO VENDA</span>
              <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,color:"#B8956A"}}>{R$(tot.pv)}</span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:16}}>
            <button onClick={salvar} style={{...Z.btn,padding:10,textAlign:"center",fontSize:12}}>Salvar Orçamento</button>
            <button onClick={()=>{salvar();nav("orcs");}} style={{...Z.btn2,padding:9,textAlign:"center"}}>Salvar & Voltar</button>
          </div>
          <div style={{marginTop:14,paddingTop:10,borderTop:"1px solid #121212"}}>
            <div style={{...Z.lbl,marginBottom:5}}>Resumo</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {[["Módulos",mods.length],["Área",N(tot.at)+"m²"],["Chapas",Object.values(tot.ca).reduce((a,c)=>a+c.n,0)],["Fita",N(tot.ft)+"m"]].map(([l,v],i)=>
                <div key={i} style={{background:"#080808",padding:5,borderRadius:2,textAlign:"center"}}><div style={{fontSize:7,color:"#3a3a3a"}}>{l}</div><div style={{color:"#eee",fontWeight:600}}>{v}</div></div>)}
            </div>
          </div>
        </div></div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:16}}><button onClick={()=>ss(2)} style={Z.btn2}>← Anterior</button></div>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════
// ORÇAMENTOS
// ═══════════════════════════════════════════════════════
function Orcs({s,d,nav}){
  return<div style={Z.pg}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
      <div><div style={Z.h1}>Orçamentos</div><div style={Z.sub}>{s.orcs.length} registrados</div></div>
      <button onClick={()=>{d({t:"SA",d:null});nav("novo");}} style={Z.btn}>+ Novo</button>
    </div>
    {s.orcs.length===0?<div style={{...Z.card,textAlign:"center",padding:44,color:"#2a2a2a"}}>Nenhum orçamento</div>:
    <div style={Z.card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Data","Cliente","Ambiente","Mód","Custo","Preço Venda","Status",""].map(h=><th key={h} style={{...Z.th,padding:"7px 8px",textAlign:h.includes("Custo")||h.includes("Preço")?"right":"left"}}>{h}</th>)}</tr></thead>
      <tbody>{s.orcs.map(o=>{const kc=KCOLS.find(c=>c.id===(s.kb[o.id]||"lead"));return<tr key={o.id} style={{borderBottom:"1px solid #111"}}>
        <td style={{padding:"7px 8px",color:"#666",fontSize:10}}>{o.dt}</td><td style={{padding:"7px 8px",color:"#ccc"}}>{o.cn}</td>
        <td style={{padding:"7px 8px",color:"#666"}}>{o.amb}</td><td style={{padding:"7px 8px",color:"#666"}}>{o.mods?.length||0}</td>
        <td style={{padding:"7px 8px",color:"#666",textAlign:"right"}}>{R$(o.cm)}</td>
        <td style={{padding:"7px 8px",color:"#B8956A",textAlign:"right",fontWeight:600}}>{R$(o.vf)}</td>
        <td style={{padding:"7px 8px"}}><span style={Z.tag(kc?.c||"#555")}>{kc?.nm||"Lead"}</span></td>
        <td style={{padding:"7px 8px"}}><div style={{display:"flex",gap:4}}>
          <button onClick={()=>{d({t:"SA",d:o});nav("novo");}} style={{...Z.btn2,padding:"3px 6px"}}><Ic.Edit/></button>
          <button onClick={()=>{d({t:"DO",id:o.id});d({t:"NT",m:"Removido"});}} style={{...Z.btnD,padding:"3px 6px"}}><Ic.Trash/></button>
        </div></td>
      </tr>;})}</tbody></table></div>}
  </div>;
}

// ═══════════════════════════════════════════════════════
// KANBAN CRM
// ═══════════════════════════════════════════════════════
function Kb({s,d}){
  const gc=oid=>s.kb[oid]||"lead";
  return<div style={Z.pg}>
    <div style={Z.h1}>Pipeline CRM</div><div style={Z.sub}>Clique nos botões para mover entre etapas</div>
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:14}}>
      {KCOLS.map(col=>{const orcs=s.orcs.filter(o=>gc(o.id)===col.id);return<div key={col.id} style={{minWidth:160,flex:1,background:"#090909",borderRadius:3,border:"1px solid #121212"}}>
        <div style={{padding:"8px 10px",borderBottom:`2px solid ${col.c}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:9,fontWeight:600,color:col.c}}>{col.nm}</span>
          <span style={{fontSize:8,color:"#3a3a3a",background:"#0d0d0d",padding:"1px 5px",borderRadius:8}}>{orcs.length}</span>
        </div>
        <div style={{padding:5,display:"flex",flexDirection:"column",gap:4,minHeight:80}}>
          {orcs.map(o=><div key={o.id} style={{background:"#0c0c0c",border:"1px solid #151515",borderRadius:2,padding:"7px 8px"}}>
            <div style={{fontSize:10,color:"#ccc",fontWeight:600}}>{o.cn}</div>
            <div style={{fontSize:8,color:"#444"}}>{o.amb}</div>
            <div style={{fontSize:11,color:"#B8956A",fontWeight:600,marginTop:3}}>{R$(o.vf)}</div>
            <div style={{display:"flex",gap:2,marginTop:5,flexWrap:"wrap"}}>
              {KCOLS.filter(c=>c.id!==col.id).slice(0,4).map(c=><button key={c.id} onClick={()=>d({t:"MK",oid:o.id,col:c.id})} style={{fontSize:6,padding:"1px 4px",borderRadius:2,border:`1px solid ${c.c}33`,background:"transparent",color:c.c,cursor:"pointer",fontFamily:"inherit"}}>→{c.nm.split(" ")[0]}</button>)}
            </div>
          </div>)}
          {orcs.length===0&&<div style={{textAlign:"center",padding:16,color:"#1a1a1a",fontSize:9}}>Vazio</div>}
        </div>
      </div>;})}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════
// CONFIG & TAXAS
// ═══════════════════════════════════════════════════════
function Cfg({s,d}){
  const[tx,st]=useState(s.tx);
  const sv=()=>{d({t:"UT",d:tx});d({t:"NT",m:"Salvo!"});};
  return<div style={Z.pg}>
    <div style={Z.h1}>Configurações & Taxas</div><div style={Z.sub}>Variáveis globais — Markup Divisor</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div style={Z.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#B8956A",marginBottom:12,fontFamily:"'Playfair Display',serif"}}>Taxas (%)</div>
        <div style={{fontSize:9,color:"#444",marginBottom:10,padding:"5px 8px",background:"#080808",borderRadius:2,borderLeft:"2px solid #B8956A"}}>Preço = Custo × Coef / (1 − Σ taxas)</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[["imp","Impostos (Simples/Presumido)"],["com","Comissão Arq./Designer"],["mont","Montagem Terceirizada"],["lucro","Lucro Líquido"],["frete","Frete / Entrega"]].map(([k,l])=>
            <div key={k}><label style={Z.lbl}>{l}</label><input type="number" value={tx[k]} onChange={e=>st({...tx,[k]:parseFloat(e.target.value)||0})} style={Z.inp} step={0.5}/></div>)}
          <div style={{background:"#080808",padding:8,borderRadius:2,display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,fontWeight:600,color:"#ccc"}}>Σ Total</span>
            <span style={{fontSize:15,fontWeight:700,color:tx.imp+tx.com+tx.mont+tx.lucro+tx.frete>=100?"#d46b6b":"#B8956A"}}>{tx.imp+tx.com+tx.mont+tx.lucro+tx.frete}%</span>
          </div>
        </div>
      </div>
      <div style={Z.card}>
        <div style={{fontSize:12,fontWeight:600,color:"#B8956A",marginBottom:12,fontFamily:"'Playfair Display',serif"}}>Custos Operacionais</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div><label style={Z.lbl}>Mão de Obra (R$/m²)</label><input type="number" value={tx.mdo} onChange={e=>st({...tx,mdo:parseFloat(e.target.value)||0})} style={Z.inp}/></div>
          <div><label style={Z.lbl}>Instalação (R$/m²)</label><input type="number" value={tx.inst} onChange={e=>st({...tx,inst:parseFloat(e.target.value)||0})} style={Z.inp}/></div>
        </div>
      </div>
    </div>
    <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}><button onClick={sv} style={Z.btn}>Salvar</button></div>
  </div>;
}
