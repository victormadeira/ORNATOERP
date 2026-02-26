import { useState, useEffect } from 'react';
import { Z, Ic, Modal } from '../ui';
import api from '../api';
import { Shield, ShieldOff, Trash2, Check, Key } from 'lucide-react';

// Menus disponíveis para configurar permissões
const MENUS = [
    { id: 'dash',          label: 'Home',                  desc: 'Painel principal e dashboard' },
    { id: 'cli',           label: 'Clientes',              desc: 'Cadastro e gestão de clientes' },
    { id: 'cat',           label: 'Biblioteca',            desc: 'Chapas, materiais e ferragens' },
    { id: 'catalogo_itens',label: 'Engenharia de Módulos', desc: 'Caixas, componentes e painéis' },
    { id: 'orcs',          label: 'Orçamentos',            desc: 'Criar e gerenciar orçamentos' },
    { id: 'kb',            label: 'Pipeline CRM',          desc: 'Funil de vendas Kanban' },
    { id: 'proj',          label: 'Projetos',              desc: 'Acompanhamento de projetos' },
    { id: 'cfg',           label: 'Config & Taxas',        desc: 'Configurações e taxas do sistema' },
];

const roleColor = r => r === 'admin' ? 'var(--primary)' : r === 'gerente' ? '#7eb8c8' : '#7eb87e';

function parsePerms(permissions) {
    if (!permissions) return null;
    try { const p = JSON.parse(permissions); return Array.isArray(p) ? p : null; } catch { return null; }
}

// ─── Modal de Permissões ──────────────────────────────────────────────────────
function PermissoesModal({ user, close, onSave }) {
    const initial = parsePerms(user.permissions);
    const [restrito, setRestrito] = useState(initial !== null);
    const [selecionados, setSelecionados] = useState(initial || MENUS.map(m => m.id));

    const toggleMenu = (id) => {
        setSelecionados(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };

    const handleSave = () => {
        if (!restrito) { onSave(null); return; }
        onSave(selecionados.length === MENUS.length ? null : selecionados);
    };

    return (
        <Modal title={`Permissões — ${user.nome}`} close={close} w={520}>
            <div className="flex flex-col gap-4">
                {/* Toggle modo restrito */}
                <div className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                    onClick={() => { setRestrito(r => !r); if (!restrito) setSelecionados(MENUS.map(m => m.id)); }}>
                    {restrito
                        ? <Shield size={16} style={{ color: 'var(--primary)' }} />
                        : <ShieldOff size={16} style={{ color: 'var(--text-muted)' }} />}
                    <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {restrito ? 'Acesso restrito a menus específicos' : 'Acesso livre a todos os menus'}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {restrito ? 'Apenas os menus marcados serão visíveis' : 'Usuário acessa todos os módulos do sistema'}
                        </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative flex-shrink-0 transition-colors`}
                        style={{ background: restrito ? 'var(--primary)' : 'var(--border)' }}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${restrito ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                </div>

                {/* Lista de menus */}
                {restrito && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Menus liberados</span>
                            <div className="flex gap-2">
                                <button onClick={() => setSelecionados(MENUS.map(m => m.id))}
                                    className="text-[11px] px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)]" style={{ color: 'var(--primary)' }}>
                                    Todos
                                </button>
                                <button onClick={() => setSelecionados([])}
                                    className="text-[11px] px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                                    Nenhum
                                </button>
                            </div>
                        </div>
                        {MENUS.map(menu => {
                            const on = selecionados.includes(menu.id);
                            return (
                                <button key={menu.id} onClick={() => toggleMenu(menu.id)}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-left w-full transition-colors"
                                    style={{
                                        background: on ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--bg-muted)',
                                        border: `1px solid ${on ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--border)'}`,
                                    }}>
                                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                                        style={{ background: on ? 'var(--primary)' : 'var(--border)' }}>
                                        {on && <Check size={10} color="white" strokeWidth={3} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium" style={{ color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            {menu.label}
                                        </div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{menu.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={close} className={Z.btn2}>Cancelar</button>
                    <button onClick={() => { handleSave(); close(); }} className={Z.btn}>Salvar Permissões</button>
                </div>
            </div>
        </Modal>
    );
}

// ─── Linha de Usuário ─────────────────────────────────────────────────────────
function UserRow({ u, isMe, onRoleChange, onToggleAtivo, onDelete, onOpenPerms }) {
    const [confirmDel, setConfirmDel] = useState(false);
    const perms = parsePerms(u.permissions);
    const menuCount = perms ? perms.length : MENUS.length;

    return (
        <tr className="hover:bg-[var(--bg-muted)] transition-colors group">
            {/* Avatar + Nome */}
            <td className="td-glass">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ color: roleColor(u.role), background: `${roleColor(u.role)}18`, border: `1px solid ${roleColor(u.role)}35` }}>
                        {u.nome?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{u.nome}</div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                    </div>
                </div>
            </td>

            {/* Cargo */}
            <td className="td-glass">
                <select value={u.role} onChange={e => onRoleChange(e.target.value)}
                    disabled={isMe}
                    className="text-xs px-2.5 py-1 rounded-md cursor-pointer font-semibold"
                    style={{
                        color: roleColor(u.role),
                        background: `${roleColor(u.role)}15`,
                        border: `1px solid ${roleColor(u.role)}35`,
                    }}>
                    <option value="admin">Admin</option>
                    <option value="gerente">Gerente</option>
                    <option value="vendedor">Vendedor</option>
                </select>
            </td>

            {/* Permissões */}
            <td className="td-glass">
                {u.role === 'admin' ? (
                    <span className="text-[11px] px-2 py-1 rounded" style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)' }}>
                        Acesso total
                    </span>
                ) : (
                    <button onClick={onOpenPerms}
                        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: perms ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        <Key size={11} />
                        {perms ? `${menuCount} menu${menuCount !== 1 ? 's' : ''}` : 'Todos menus'}
                    </button>
                )}
            </td>

            {/* Status */}
            <td className="td-glass">
                <button onClick={() => !isMe && onToggleAtivo()}
                    disabled={isMe}
                    className={`text-[10px] px-2.5 py-1 rounded-md font-semibold border cursor-pointer transition-colors flex items-center gap-1 ${
                        u.ativo
                            ? 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/20'
                            : 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                    } ${isMe ? 'opacity-50 cursor-default' : ''}`}>
                    {u.ativo ? <><Ic.Check /> Ativo</> : <><Ic.X /> Inativo</>}
                </button>
            </td>

            {/* Último Acesso */}
            <td className="td-glass text-xs">
                {u.ultimo_acesso ? (
                    <div>
                        <div style={{ color: 'var(--text-primary)' }}>
                            {new Date(u.ultimo_acesso).toLocaleDateString('pt-BR')}
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                            {new Date(u.ultimo_acesso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Nunca</span>
                )}
            </td>

            {/* Criado em */}
            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>
                {u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '—'}
            </td>

            {/* Ações */}
            <td className="td-glass">
                {!isMe && (
                    confirmDel ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Confirmar?</span>
                            <button onClick={onDelete}
                                className="text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer"
                                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                                Excluir
                            </button>
                            <button onClick={() => setConfirmDel(false)}
                                className="text-[10px] px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)]"
                                style={{ color: 'var(--text-muted)' }}>
                                Não
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmDel(true)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md cursor-pointer transition-all"
                            style={{ color: 'rgba(239,68,68,0.5)' }}
                            title="Remover usuário">
                            <Trash2 size={13} />
                        </button>
                    )
                )}
            </td>
        </tr>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Users({ notify, meUser }) {
    const [users, setUsers] = useState([]);
    const [moNovo, setMoNovo] = useState(false);
    const [permUser, setPermUser] = useState(null);
    const [f, setF] = useState({ nome: '', email: '', senha: '', role: 'vendedor' });

    const load = () => api.get('/auth/users').then(setUsers).catch(() => { });
    useEffect(() => { load(); }, []);

    const criar = async () => {
        if (!f.nome || !f.email || !f.senha) { notify('Preencha todos os campos'); return; }
        try {
            await api.post('/auth/register', f);
            notify('Usuário criado!');
            setF({ nome: '', email: '', senha: '', role: 'vendedor' });
            setMoNovo(false);
            load();
        } catch (ex) { notify(ex.error || 'Erro ao criar usuário'); }
    };

    const update = async (id, patch) => {
        try { await api.put(`/auth/users/${id}`, patch); load(); }
        catch (ex) { notify(ex.error || 'Erro'); }
    };

    const deletar = async (id) => {
        try { await api.del(`/auth/users/${id}`); notify('Usuário removido'); load(); }
        catch (ex) { notify(ex.error || 'Erro ao remover'); }
    };

    const salvarPerms = async (userId, perms) => {
        try { await api.put(`/auth/users/${userId}`, { permissions: perms }); notify('Permissões salvas!'); load(); }
        catch (ex) { notify(ex.error || 'Erro ao salvar'); }
    };

    return (
        <div className={Z.pg}>
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className={Z.h1}>Usuários</h1>
                    <p className={Z.sub}>{users.length} cadastrado{users.length !== 1 ? 's' : ''} no sistema</p>
                </div>
                <button onClick={() => setMoNovo(true)} className={Z.btn}>
                    <Ic.Plus /> Novo Usuário
                </button>
            </div>

            <div className={`${Z.card} !p-0 overflow-hidden`}>
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr>
                            {['Usuário', 'Cargo', 'Permissões', 'Status', 'Último Acesso', 'Cadastro', ''].map(h => (
                                <th key={h} className={Z.th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {users.map(u => (
                            <UserRow
                                key={u.id}
                                u={u}
                                isMe={meUser?.id === u.id}
                                onRoleChange={v => update(u.id, { role: v })}
                                onToggleAtivo={() => update(u.id, { ativo: u.ativo ? 0 : 1 })}
                                onDelete={() => deletar(u.id)}
                                onOpenPerms={() => setPermUser(u)}
                            />
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Nenhum usuário cadastrado
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal: Novo Usuário */}
            {moNovo && (
                <Modal title="Novo Usuário" close={() => setMoNovo(false)}>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className={Z.lbl}>Nome *</label>
                            <input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} className={Z.inp} placeholder="Nome completo" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Email *</label>
                            <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={Z.inp} placeholder="email@empresa.com" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Senha *</label>
                            <input type="password" value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} className={Z.inp} placeholder="Mínimo 6 caracteres" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Cargo</label>
                            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className={Z.inp}>
                                <option value="vendedor">Vendedor</option>
                                <option value="gerente">Gerente</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setMoNovo(false)} className={Z.btn2}>Cancelar</button>
                            <button onClick={criar} className={Z.btn}>Criar Usuário</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal: Permissões */}
            {permUser && (
                <PermissoesModal
                    user={permUser}
                    close={() => setPermUser(null)}
                    onSave={perms => salvarPerms(permUser.id, perms)}
                />
            )}
        </div>
    );
}
