import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowUpRight, Check, Download, FileText, LayoutGrid, Printer, Zap } from 'lucide-react';
import OrcamentoRapido from '../../src/pages/OrcamentoRapido.jsx';
import { createDemoQuickQuoteAdapter } from './demoAdapter.js';
import './preview.css';

const adapter = createDemoQuickQuoteAdapter();
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

function downloadQuote(quote) {
    const file = new Blob([JSON.stringify(quote, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ornato-orcamento-demonstracao.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Proposal({ quote, onBack }) {
    const count = quote.ambientes.flatMap(amb => amb.itens || []).reduce((sum, item) => sum + item.qtd, 0);
    return <div className="demo-proposal-wrap">
        <div className="demo-proposal-toolbar">
            <button onClick={onBack}><ArrowLeft size={16} /> Voltar ao orçamento</button>
            <div><button onClick={() => downloadQuote(quote)}><Download size={16} /> Exportar dados</button><button className="demo-dark-button" onClick={() => window.print()}><Printer size={16} /> Imprimir / PDF</button></div>
        </div>
        <article className="demo-proposal">
            <header><div className="demo-wordmark">ornato<span>ERP</span></div><span className="demo-document-label">PROPOSTA DEMONSTRATIVA<br />{quote.numero}</span></header>
            <div className="demo-proposal-intro"><span>PROJETO DE MARCENARIA</span><h1>{quote.projeto}</h1><p>Preparado para {quote.cliente_nome}</p></div>
            <div className="demo-proposal-notice">Documento de demonstração. Os preços são fictícios e não constituem uma proposta comercial da marcenaria.</div>
            {quote.ambientes.map(amb => <section key={amb.id} className="demo-proposal-room"><h2>{amb.nome}</h2><table><thead><tr><th>Descrição</th><th>Medidas · L × A × P</th><th>Qtd.</th></tr></thead><tbody>{(amb.itens || []).map(item => <tr key={item.id}><td><strong>{item.nome}</strong>{item.composition?.mode === 'catalog' ? <small>{(item.componentes || []).map(ci => `${ci.nome || ci.compDef?.nome || 'Componente'} × ${ci.qtd || 1}`).join(' · ')}</small> : item.quick?.group !== 'extras' && <small>{[
                item.quick?.counts?.doors ? `${item.quick.counts.doors} porta(s)` : '',
                item.quick?.counts?.drawers ? `${item.quick.counts.drawers} gaveta(s)` : '',
                item.quick?.counts?.shelves ? `${item.quick.counts.shelves} prateleira(s)` : '',
            ].filter(Boolean).join(' · ')}</small>}</td><td>{item.dims.l} × {item.dims.a}{item.quick?.group !== 'extras' ? ` × ${item.dims.p}` : ''} mm</td><td>{item.qtd}</td></tr>)}</tbody></table></section>)}
            <div className="demo-proposal-total"><div><span>VALOR DO ORÇAMENTO</span><small>{count} itens, incluindo complementos · desconto já aplicado</small></div><strong>{money(quote.valor_venda)}</strong></div>
            {quote.obs && <section className="demo-proposal-observations"><h2>Escopo e observações</h2><p>{quote.obs}</p></section>}
            <section className="demo-proposal-observations"><h2>Próximos passos no ERP</h2><p>Na versão integrada, este orçamento abre no editor completo para definir condições de pagamento, preparar a proposta e seguir o fluxo comercial. As receitas desta estimativa precisam de conferência técnica antes da fabricação.</p></section>
            <footer>ORNATOERP · Orçamento rápido · Sem modelagem 3D</footer>
        </article>
    </div>;
}

function App() {
    const [quote, setQuote] = useState(null);
    const [showProposal, setShowProposal] = useState(false);
    const [toast, setToast] = useState('');
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(timer);
    }, [toast]);
    const openProposal = saved => { setQuote(saved); setShowProposal(true); window.scrollTo(0, 0); };
    return <div className="demo-shell">
        <aside className="demo-nav">
            <div className="demo-brand"><div className="demo-brand-symbol" aria-hidden="true"><i /><i /></div><div className="demo-wordmark">ornato<span>ERP</span></div></div>
            <div className="demo-company">Studio Ornato<small>Marcenaria sob medida</small></div>
            <span className="demo-nav-label">COMERCIAL</span>
            <button className={!showProposal ? 'is-active' : ''} onClick={() => setShowProposal(false)}><Zap size={17} /><span>Orçamento rápido</span><span className="demo-new">NOVO</span></button>
            {quote && <button className={showProposal ? 'is-active' : ''} onClick={() => setShowProposal(true)}><FileText size={17} /><span>Proposta de exemplo</span></button>}
            <div className="demo-nav-context"><LayoutGrid size={20} /><strong>Caixa + componentes</strong><p>Escolha a caixa, componha o móvel e defina suas ferragens.</p></div>
            <div className="demo-nav-footer"><span className="demo-avatar">SO</span><div>Studio Ornato<small>Ambiente de demonstração</small></div></div>
        </aside>
        <div className="demo-body">
            <header className="demo-topbar"><div><span>ORNATOERP</span><span className="demo-breadcrumb-separator">/</span><strong>{showProposal ? 'Proposta' : 'Orçamento rápido'}</strong></div><a href="https://github.com/victormadeira/ORNATOERP" target="_blank" rel="noreferrer">Ver sistema no GitHub <ArrowUpRight size={14} /></a></header>
            <div hidden={showProposal}><OrcamentoRapido adapter={adapter} onOpenEditor={openProposal} notify={setToast} /></div>
            {showProposal && quote && <Proposal quote={quote} onBack={() => setShowProposal(false)} />}
        </div>
        {toast && <div className="demo-toast" role="status"><Check size={17} />{toast}</div>}
    </div>;
}

createRoot(document.getElementById('root')).render(<App />);
