import { useState } from 'react';
import { Z, Ic, Modal } from '../ui';
import api from '../api';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function maskCPF(v) {
    return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}
function maskCNPJ(v) {
    return v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
}
function maskCEP(v) {
    return v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d{1,3})$/,'$1-$2');
}
function maskTel(v) {
    const d = v.replace(/\D/g,'').slice(0,11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
}

const EMPTY = {
    nome: '', tel: '', email: '', arq: '', cidade: '',
    tipo_pessoa: 'fisica', cpf: '', cnpj: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', estado: '', obs: ''
};

export default function Cli({ clis, reload, notify }) {
    const [f, sf] = useState(EMPTY);
    const [ed, se] = useState(null);
    const [mo, sm] = useState(false);
    const [sr, ssr] = useState("");
    const [tab, setTab] = useState('basico');
    const [confirmDel, setConfirmDel] = useState(null);
    const [cepLoading, setCepLoading] = useState(false);

    const fl = clis.filter(c =>
        c.nome.toLowerCase().includes(sr.toLowerCase()) ||
        (c.tel || '').includes(sr) ||
        (c.email || '').toLowerCase().includes(sr.toLowerCase())
    );

    // Busca CEP na ViaCEP
    const buscarCEP = async (cep) => {
        const digits = cep.replace(/\D/g, '');
        if (digits.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
            const data = await res.json();
            if (!data.erro) {
                sf(prev => ({
                    ...prev,
                    endereco: data.logradouro || prev.endereco,
                    bairro: data.bairro || prev.bairro,
                    cidade: data.localidade || prev.cidade,
                    estado: data.uf || prev.estado,
                }));
            } else {
                notify('CEP não encontrado');
            }
        } catch {
            notify('Erro ao buscar CEP');
        } finally {
            setCepLoading(false);
        }
    };

    const abrirModal = (cli = null) => {
        if (cli) {
            sf({ ...EMPTY, ...cli });
            se(cli.id);
        } else {
            sf(EMPTY);
            se(null);
        }
        setTab('basico');
        sm(true);
    };

    const sv = async () => {
        if (!f.nome.trim()) { notify("Nome é obrigatório"); return; }
        try {
            if (ed) { await api.put(`/clientes/${ed}`, f); }
            else { await api.post('/clientes', f); }
            notify(ed ? "Cliente atualizado!" : "Cliente criado!");
            sm(false);
            reload();
        } catch (ex) { notify(ex.error || "Erro ao salvar"); }
    };

    const del = async () => {
        if (!confirmDel) return;
        try {
            await api.del(`/clientes/${confirmDel}`);
            notify("Cliente removido");
            setConfirmDel(null);
            reload();
        } catch (ex) { notify(ex.error || "Erro ao excluir"); }
    };

    const tabCls = (t) => `px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${tab === t
        ? 'text-white'
        : 'hover:bg-[var(--bg-hover)]'
    }`;
    const tabStyle = (t) => tab === t ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-secondary)' };

    return (
        <div className={Z.pg}>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className={Z.h1}>Clientes</h1>
                    <p className={Z.sub}>{clis.length} registros cadastrados</p>
                </div>
                <button onClick={() => abrirModal()} className={Z.btn}>
                    <Ic.Plus /> Novo Cliente
                </button>
            </div>

            {/* Busca */}
            <div className="mb-6 max-w-sm relative">
                <input
                    placeholder="Buscar por nome, telefone ou e-mail..."
                    value={sr}
                    onChange={e => ssr(e.target.value)}
                    className={`${Z.inp} !pl-9`}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                    <Ic.Search />
                </div>
            </div>

            {/* Tabela */}
            <div className={`${Z.card} !p-0 overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr>
                                {["Nome / Empresa", "Contato", "Localização", "Arq./Designer", "Ações"].map(h => (
                                    <th key={h} className={Z.th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {fl.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="py-12 text-center text-[var(--text-muted)] text-sm">
                                        Nenhum cliente encontrado
                                    </td>
                                </tr>
                            ) : fl.map(c => (
                                <tr key={c.id} className="group hover:bg-[var(--bg-muted)] transition-colors">
                                    <td className="td-glass">
                                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.nome}</div>
                                        {(c.cpf || c.cnpj) && (
                                            <div className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {c.tipo_pessoa === 'juridica' ? c.cnpj : c.cpf}
                                            </div>
                                        )}
                                    </td>
                                    <td className="td-glass">
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.tel || '—'}</div>
                                        {c.email && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.email}</div>}
                                    </td>
                                    <td className="td-glass">
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {[c.cidade, c.estado].filter(Boolean).join(', ') || '—'}
                                        </div>
                                        {c.bairro && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.bairro}</div>}
                                    </td>
                                    <td className="td-glass text-sm" style={{ color: 'var(--text-secondary)' }}>{c.arq || '—'}</td>
                                    <td className="td-glass">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => abrirModal(c)}
                                                className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                                                style={{ color: 'var(--text-secondary)' }} title="Editar"
                                            >
                                                <Ic.Edit />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDel(c.id)}
                                                className="p-1.5 rounded-md transition-colors bg-red-500/10 hover:bg-red-500/20"
                                                style={{ color: '#ef4444' }} title="Excluir"
                                            >
                                                <Ic.Trash />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Confirmação Exclusão */}
            {confirmDel && (
                <Modal title="Confirmar Exclusão" close={() => setConfirmDel(null)} w={420}>
                    <div className="flex flex-col gap-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEE2E2' }}>
                                <span style={{ color: '#DC2626' }}><Ic.Alert /></span>
                            </div>
                            <div>
                                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    Excluir cliente permanentemente?
                                </p>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Esta ação não pode ser desfeita. Os orçamentos vinculados continuarão existindo.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => setConfirmDel(null)} className={Z.btn2}>Cancelar</button>
                            <button onClick={del} className={Z.btnD}>Excluir</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Criar/Editar Cliente */}
            {mo && (
                <Modal title={ed ? "Editar Cliente" : "Novo Cliente"} close={() => sm(false)} w={620}>
                    {/* Abas */}
                    <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                        {[
                            { id: 'basico', label: 'Dados Básicos', icon: <Ic.Usr /> },
                            { id: 'endereco', label: 'Endereço', icon: <Ic.MapPin /> },
                            { id: 'obs', label: 'Observações', icon: <Ic.File /> },
                        ].map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 ${tabCls(t.id)}`}
                                style={tabStyle(t.id)}>
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Aba Dados Básicos */}
                    {tab === 'basico' && (
                        <div className="space-y-4">
                            {/* Tipo pessoa */}
                            <div className="flex gap-3">
                                {['fisica', 'juridica'].map(tp => (
                                    <button key={tp} onClick={() => sf({ ...f, tipo_pessoa: tp })}
                                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${f.tipo_pessoa === tp ? 'border-[var(--primary)] text-white' : 'border-[var(--border)]'}`}
                                        style={f.tipo_pessoa === tp ? { background: 'var(--primary)' } : { color: 'var(--text-secondary)' }}>
                                        {tp === 'fisica' ? <><Ic.Usr /> Pessoa Física</> : <><Ic.Building /> Pessoa Jurídica</>}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className={Z.lbl}>Nome Completo / Razão Social *</label>
                                <input value={f.nome} onChange={e => sf({ ...f, nome: e.target.value })}
                                    className={Z.inp} placeholder="Ex: João da Silva" autoFocus />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={Z.lbl}>{f.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}</label>
                                    <input
                                        value={f.tipo_pessoa === 'juridica' ? f.cnpj : f.cpf}
                                        onChange={e => {
                                            const v = f.tipo_pessoa === 'juridica' ? maskCNPJ(e.target.value) : maskCPF(e.target.value);
                                            sf({ ...f, [f.tipo_pessoa === 'juridica' ? 'cnpj' : 'cpf']: v });
                                        }}
                                        className={Z.inp} placeholder={f.tipo_pessoa === 'juridica' ? '00.000.000/0001-00' : '000.000.000-00'}
                                    />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Telefone / WhatsApp</label>
                                    <input value={f.tel}
                                        onChange={e => sf({ ...f, tel: maskTel(e.target.value) })}
                                        className={Z.inp} placeholder="(11) 90000-0000" />
                                </div>
                            </div>

                            <div>
                                <label className={Z.lbl}>E-mail</label>
                                <input type="email" value={f.email}
                                    onChange={e => sf({ ...f, email: e.target.value })}
                                    className={Z.inp} placeholder="cliente@email.com" />
                            </div>

                            <div>
                                <label className={Z.lbl}>Arquiteto / Designer Responsável</label>
                                <input value={f.arq} onChange={e => sf({ ...f, arq: e.target.value })}
                                    className={Z.inp} placeholder="Nome do parceiro (opcional)" />
                            </div>
                        </div>
                    )}

                    {/* Aba Endereço */}
                    {tab === 'endereco' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className={Z.lbl}>CEP</label>
                                    <div className="relative">
                                        <input value={f.cep}
                                            onChange={e => {
                                                const v = maskCEP(e.target.value);
                                                sf({ ...f, cep: v });
                                                if (v.replace(/\D/g,'').length === 8) buscarCEP(v);
                                            }}
                                            className={Z.inp} placeholder="00000-000" maxLength={9} />
                                        {cepLoading && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Logradouro</label>
                                    <input value={f.endereco} onChange={e => sf({ ...f, endereco: e.target.value })}
                                        className={Z.inp} placeholder="Rua, Av., Alameda..." />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={Z.lbl}>Número</label>
                                    <input value={f.numero} onChange={e => sf({ ...f, numero: e.target.value })}
                                        className={Z.inp} placeholder="123" />
                                </div>
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Complemento</label>
                                    <input value={f.complemento} onChange={e => sf({ ...f, complemento: e.target.value })}
                                        className={Z.inp} placeholder="Apto 12, Bloco B..." />
                                </div>
                            </div>

                            <div>
                                <label className={Z.lbl}>Bairro</label>
                                <input value={f.bairro} onChange={e => sf({ ...f, bairro: e.target.value })}
                                    className={Z.inp} placeholder="Bairro" />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Cidade</label>
                                    <input value={f.cidade} onChange={e => sf({ ...f, cidade: e.target.value })}
                                        className={Z.inp} placeholder="São Paulo" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Estado</label>
                                    <select value={f.estado} onChange={e => sf({ ...f, estado: e.target.value })} className={Z.inp}>
                                        <option value="">UF</option>
                                        {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Aba Observações */}
                    {tab === 'obs' && (
                        <div>
                            <label className={Z.lbl}>Observações internas sobre o cliente</label>
                            <textarea
                                value={f.obs}
                                onChange={e => sf({ ...f, obs: e.target.value })}
                                className={`${Z.inp} resize-none`}
                                rows={6}
                                placeholder="Preferências, histórico, notas importantes..."
                            />
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex gap-1">
                            {['basico', 'endereco', 'obs'].map((t, i) => (
                                <div key={t} className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                                    onClick={() => setTab(t)}
                                    style={{ background: tab === t ? 'var(--primary)' : 'var(--border)' }} />
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => sm(false)} className={Z.btn2}>Cancelar</button>
                            <button onClick={sv} className={Z.btn}>
                                {ed ? "Atualizar" : "Salvar Cliente"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
