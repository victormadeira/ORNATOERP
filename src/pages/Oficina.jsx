// ═══════════════════════════════════════════════════════════════
// Oficina — Kanban de Produção (chão de fábrica + modo TV)
// Card = ambiente do projeto · viaja pelas 5 etapas produtivas
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import {
  Scissors, Layers, Wrench, Package, Truck, Plus, X, Monitor, ChevronRight,
  Paperclip, Link, MessageSquare, CheckSquare, Clock, AlertCircle, User,
  Edit2, Trash2, GripVertical, ExternalLink, Send, Check, Square, ArrowRight,
  Calendar, FolderOpen, Tag, RefreshCw, Maximize2, Filter, Play, Pause,
  CheckCircle, Lock, Unlock, Settings, ChevronDown, ZapOff, Zap,
} from 'lucide-react';
import { createPortal } from 'react-dom';

// ─── Paleta de projetos (até 10 projetos simultâneos) ──────────
const PROJ_COLORS = [
  '#C9A96E','#3B82F6','#10B981','#F97316','#8B5CF6',
  '#EC4899','#06B6D4','#EF4444','#84CC16','#F59E0B',
];

// ─── Etapas de produção ────────────────────────────────────────
const ETAPAS = [
  { id: 'corte',        label: 'CORTE',         short: 'Corte',        Icon: Scissors,  col: '#3B82F6', bg: '#EFF6FF' },
  { id: 'cola_borda',   label: 'COLA DE BORDA', short: 'Cola Borda',   Icon: Layers,    col: '#F97316', bg: '#FFF7ED' },
  { id: 'pre_montagem', label: 'PRÉ-MONTAGEM',  short: 'Pré-Mont.',    Icon: Wrench,    col: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'acabamento',   label: 'ACABAMENTO',    short: 'Acabamento',   Icon: Package,   col: '#C9A96E', bg: '#FEFCE8' },
  { id: 'expedicao',    label: 'EXPEDIÇÃO',     short: 'Expedição',    Icon: Truck,     col: '#10B981', bg: '#F0FDF4' },
];
const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e => [e.id, e]));

// ─── Utils ─────────────────────────────────────────────────────
const tok  = () => localStorage.getItem('erp_token') || '';
const hdr  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` });
const api  = (path, opts = {}) => fetch(`/api/oficina${path}`, { headers: hdr(), ...opts });
const japi = (path, opts = {}) => api(path, opts).then(r => r.json());

function prazoClass(prazo) {
  if (!prazo) return null;
  const days = Math.floor((new Date(prazo + 'T12:00:00') - new Date()) / 86400000);
  if (days < 0)  return { label: `${Math.abs(days)}d atraso`, color: '#EF4444', bg: '#FEF2F2' };
  if (days === 0) return { label: 'Hoje',                      color: '#F97316', bg: '#FFF7ED' };
  if (days <= 2)  return { label: `${days}d`,                  color: '#F59E0B', bg: '#FFFBEB' };
  return { label: `${days}d`,                                  color: '#64748b', bg: '#F8FAFC' };
}

function ageDot(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d <= 1)  return '#10B981';
  if (d <= 3)  return '#F59E0B';
  return '#EF4444';
}

function timeFmt(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dtFmt(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ─── Draggable card shell ──────────────────────────────────────
function DraggableCard({ card, onOpen, isDragOverlay }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: isDragOverlay ? 'grabbing' : 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardContent card={card} onOpen={onOpen} />
    </div>
  );
}

// ─── Card visual ───────────────────────────────────────────────
function CardContent({ card, onOpen }) {
  const pz = prazoClass(card.prazo);
  const pct = card.checklist_total > 0 ? Math.round((card.checklist_done / card.checklist_total) * 100) : null;

  return (
    <div
      onClick={() => onOpen(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(card.id)}
      style={{
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #E2E8F0',
        borderLeft: `4px solid ${card.cor || '#C9A96E'}`,
        padding: '12px 12px 10px',
        marginBottom: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = card.cor || '#C9A96E'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
    >
      {/* Ambiente */}
      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 4, lineHeight: 1.3 }}>
        {card.ambiente}
      </div>

      {/* Projeto + cliente */}
      {(card.projeto_nome || card.cliente_nome) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: card.cor || '#C9A96E', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.projeto_nome}{card.cliente_nome ? ` · ${card.cliente_nome}` : ''}
          </span>
        </div>
      )}

      {/* Marceneiro — avatar + nome (destaque) */}
      {(card.marceneiro_id || card.responsavel) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px 4px 4px', background: '#F1F5F9', borderRadius: 99,
          marginBottom: 6, width: 'fit-content', maxWidth: '100%',
        }}>
          {card.marceneiro_id ? (
            <MarcenaroAvatar marceneiro={{ nome: card.marceneiro_nome, cor: card.marceneiro_cor, foto: card.marceneiro_foto }} size={20} />
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <User size={11} />
            </div>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.marceneiro_nome || card.responsavel}
          </span>
        </div>
      )}

      {/* Chips: prazo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: pct !== null ? 8 : 0 }}>
        {pz && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: pz.bg, color: pz.color, fontVariantNumeric: 'tabular-nums' }}>
            <Calendar size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />{dtFmt(card.prazo)}
          </span>
        )}
      </div>

      {/* Checklist progress */}
      {pct !== null && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              <CheckSquare size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
              {card.checklist_done}/{card.checklist_total}
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10B981' : (card.cor || '#C9A96E'), borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Ícones de footer */}
      {(card.anexos_count > 0 || card.comentarios_count > 0) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {card.comentarios_count > 0 && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
              <MessageSquare size={11} />{card.comentarios_count}
            </span>
          )}
          {card.anexos_count > 0 && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Paperclip size={11} />{card.anexos_count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Coluna do kanban ──────────────────────────────────────────
function KanbanColumn({ etapa, cards, onOpen, onAddCard }) {
  const { isOver, setNodeRef } = useDroppable({ id: etapa.id });
  const { Icon } = etapa;

  return (
    <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header da coluna */}
      <div style={{
        padding: '10px 12px 9px',
        borderRadius: '10px 10px 0 0',
        background: etapa.bg,
        borderBottom: `2px solid ${etapa.col}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <Icon size={13} style={{ color: etapa.col, flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#1e293b', letterSpacing: '0.08em', flex: 1 }}>
          {etapa.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: etapa.col,
          background: `${etapa.col}20`, padding: '1px 7px', borderRadius: 99,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {cards.length}
        </span>
      </div>

      {/* Body scrollável */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 8px 4px',
          background: isOver ? `${etapa.col}08` : '#F8FAFC',
          border: `1px solid ${isOver ? etapa.col + '50' : '#E2E8F0'}`,
          borderTop: 'none', borderRadius: '0 0 10px 10px',
          transition: 'background 0.15s, border-color 0.15s',
          minHeight: 100,
        }}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <DraggableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: '#94a3b8', fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>
              <Icon size={28} style={{ margin: '0 auto' }} />
            </div>
            Arraste um card aqui
          </div>
        )}

        <button
          onClick={() => onAddCard(etapa.id)}
          style={{
            width: '100%', marginTop: 4, padding: '8px', border: '1px dashed #CBD5E1',
            borderRadius: 8, background: 'transparent', color: '#94a3b8',
            fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 5, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = etapa.col; e.currentTarget.style.color = etapa.col; e.currentTarget.style.background = `${etapa.col}08`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
          aria-label={`Adicionar card em ${etapa.short}`}
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>
    </div>
  );
}

// ─── Modal de detalhe do card ──────────────────────────────────
function CardModal({ cardId, cards, onClose, onUpdate, onDelete, notify, team }) {
  const [data, setData]       = useState(null);
  const [edit, setEdit]       = useState(false);
  const [form, setForm]       = useState({});
  const [newCheck, setNewCheck] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newAnexNome, setNewAnexNome] = useState('');
  const [newAnexUrl, setNewAnexUrl] = useState('');
  const [saving, setSaving]   = useState(false);
  const [projList, setProjList] = useState([]);

  const load = useCallback(() =>
    japi(`/${cardId}`).then(d => { setData(d); setForm({ ...d }); }), [cardId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    japi('/util/projetos').then(d => Array.isArray(d) && setProjList(d));
  }, []);
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await japi(`/${cardId}`, { method: 'PUT', body: JSON.stringify(form) });
      setData(updated); setForm({ ...updated }); setEdit(false);
      onUpdate(updated);
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm('Remover este card da Oficina?')) return;
    await japi(`/${cardId}`, { method: 'DELETE' });
    onDelete(cardId); onClose();
  };

  const moveEtapa = async (etapa) => {
    await japi(`/${cardId}/etapa`, { method: 'PATCH', body: JSON.stringify({ etapa }) });
    const updated = { ...data, etapa };
    setData(updated);
    onUpdate(updated);
    notify && notify('success', `Movido para ${ETAPA_MAP[etapa]?.short}`);
  };

  const addCheck = async () => {
    if (!newCheck.trim()) return;
    const item = await japi(`/${cardId}/checklist`, { method: 'POST', body: JSON.stringify({ texto: newCheck }) });
    setData(d => ({ ...d, checklist: [...(d.checklist || []), item] }));
    setNewCheck('');
  };

  const toggleCheck = async (cid) => {
    const item = await japi(`/checklist/${cid}`, { method: 'PATCH' });
    setData(d => ({ ...d, checklist: d.checklist.map(c => c.id === cid ? item : c) }));
  };

  const delCheck = async (cid) => {
    await japi(`/checklist/${cid}`, { method: 'DELETE' });
    setData(d => ({ ...d, checklist: d.checklist.filter(c => c.id !== cid) }));
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const msg = await japi(`/${cardId}/comentarios`, { method: 'POST', body: JSON.stringify({ autor: 'Equipe', conteudo: newComment }) });
    setData(d => ({ ...d, comentarios: [...(d.comentarios || []), msg] }));
    setNewComment('');
  };

  const delComment = async (cid) => {
    await japi(`/comentarios/${cid}`, { method: 'DELETE' });
    setData(d => ({ ...d, comentarios: d.comentarios.filter(c => c.id !== cid) }));
  };

  const addAnex = async () => {
    if (!newAnexUrl.trim()) return;
    const a = await japi(`/${cardId}/anexos`, { method: 'POST', body: JSON.stringify({ nome: newAnexNome || newAnexUrl, url: newAnexUrl }) });
    setData(d => ({ ...d, anexos: [...(d.anexos || []), a] }));
    setNewAnexNome(''); setNewAnexUrl('');
  };

  const delAnex = async (aid) => {
    await japi(`/anexos/${aid}`, { method: 'DELETE' });
    setData(d => ({ ...d, anexos: d.anexos.filter(a => a.id !== aid) }));
  };

  if (!data) return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff' }}>Carregando…</div>
    </div>, document.body
  );

  const pz = prazoClass(data.prazo);
  const checkTotal = data.checklist?.length || 0;
  const checkDone  = data.checklist?.filter(c => c.feito).length || 0;

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0',
    borderRadius: 7, fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box',
  };

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={data.ambiente}
      className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 680,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.2)',
        }}
        className="md:rounded-2xl"
      >
        {/* Barra de etapas */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid #E2E8F0', padding: '0 4px', flexShrink: 0, background: '#F8FAFC' }}>
          {ETAPAS.map((e, i) => {
            const active = data.etapa === e.id;
            return (
              <React.Fragment key={e.id}>
                <button
                  onClick={() => !active && moveEtapa(e.id)}
                  style={{
                    padding: '10px 14px', border: 0, background: 'none', cursor: active ? 'default' : 'pointer',
                    fontSize: 11, fontWeight: active ? 800 : 500,
                    color: active ? e.col : '#94a3b8',
                    borderBottom: active ? `2px solid ${e.col}` : '2px solid transparent',
                    marginBottom: -1, whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  {e.short}
                </button>
                {i < ETAPAS.length - 1 && <ChevronRight size={12} style={{ alignSelf: 'center', color: '#CBD5E1', flexShrink: 0 }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px 12px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: data.cor || '#C9A96E', flexShrink: 0, marginTop: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {edit ? (
              <input value={form.ambiente} onChange={e => setForm(f => ({ ...f, ambiente: e.target.value }))}
                style={{ ...inputStyle, fontSize: 17, fontWeight: 700 }} placeholder="Nome do ambiente" />
            ) : (
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>{data.ambiente}</h2>
            )}
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
              {data.projeto_nome && <span style={{ fontWeight: 600 }}>{data.projeto_nome}</span>}
              {data.cliente_nome && <span> · {data.cliente_nome}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {edit ? (
              <>
                <button onClick={() => setEdit(false)} style={{ padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>Cancelar</button>
                <button onClick={save} disabled={saving} style={{ padding: '6px 14px', border: 0, borderRadius: 7, background: '#0E1116', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Salvar'}</button>
              </>
            ) : (
              <>
                <button onClick={() => setEdit(true)} title="Editar" style={{ padding: 7, border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex' }}><Edit2 size={14} /></button>
                <button onClick={del} title="Excluir" style={{ padding: 7, border: '1px solid #FEE2E2', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#EF4444', display: 'flex' }}><Trash2 size={14} /></button>
                <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ padding: 7, border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={14} /></button>
              </>
            )}
          </div>
        </div>

        {/* Conteúdo scrollável */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Metadados */}
          {edit ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Projeto</div>
                <select value={form.projeto_id || ''} onChange={e => {
                  const p = projList.find(x => String(x.id) === e.target.value);
                  setForm(f => ({ ...f, projeto_id: p?.id || null, projeto_nome: p?.nome || '', cliente_nome: p?.cliente_nome || '' }));
                }} style={{ ...inputStyle }}>
                  <option value="">— sem vínculo —</option>
                  {projList.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cliente_nome ? ` (${p.cliente_nome})` : ''}</option>)}
                </select>
              </label>
              <label>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Marceneiro</div>
                <MarcenaroPicker value={form.marceneiro_id} onChange={id => setForm(f => ({ ...f, marceneiro_id: id }))} team={team || []} />
              </label>
              <label>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Prazo</div>
                <input type="date" value={form.prazo || ''} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Cor do projeto</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {PROJ_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, cor: c }))}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: form.cor === c ? '3px solid #0F172A' : '2px solid transparent', cursor: 'pointer', boxSizing: 'border-box' }}
                      title={c} />
                  ))}
                </div>
              </label>
              <label style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Descrição</div>
                <textarea value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Detalhes, observações…" />
              </label>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {data.marceneiro_id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F1F5F9', padding: '4px 10px 4px 4px', borderRadius: 99 }}>
                  <MarcenaroAvatar marceneiro={{ nome: data.marceneiro_nome, cor: data.marceneiro_cor, foto: data.marceneiro_foto }} size={24} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{data.marceneiro_nome}</span>
                </div>
              ) : data.responsavel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', background: '#F1F5F9', padding: '5px 10px', borderRadius: 99 }}>
                  <User size={12} /><span>{data.responsavel}</span>
                </div>
              ) : null}
              {pz && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: pz.color, background: pz.bg, padding: '5px 10px', borderRadius: 99, fontWeight: 700 }}>
                  <Calendar size={12} /><span>{dtFmt(data.prazo)} {pz.label !== dtFmt(data.prazo) ? `(${pz.label})` : ''}</span>
                </div>
              )}
              {data.descricao && (
                <div style={{ width: '100%', fontSize: 13, color: '#475569', lineHeight: 1.6, background: '#F8FAFC', padding: '10px 14px', borderRadius: 8, borderLeft: `3px solid ${data.cor || '#C9A96E'}` }}>
                  {data.descricao}
                </div>
              )}
            </div>
          )}

          {/* Checklist */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckSquare size={14} style={{ color: '#C9A96E' }} /> Checklist
                {checkTotal > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>({checkDone}/{checkTotal})</span>}
              </span>
            </div>
            {checkTotal > 0 && (
              <div style={{ height: 4, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${Math.round(checkDone / checkTotal * 100)}%`, height: '100%', background: '#10B981', borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.checklist?.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <button onClick={() => toggleCheck(item.id)} style={{ flexShrink: 0, border: 0, background: 'none', cursor: 'pointer', color: item.feito ? '#10B981' : '#CBD5E1', padding: 2, display: 'flex' }}>
                    {item.feito ? <CheckSquare size={17} /> : <Square size={17} />}
                  </button>
                  <span style={{ flex: 1, fontSize: 13, color: item.feito ? '#94a3b8' : '#334155', textDecoration: item.feito ? 'line-through' : 'none' }}>{item.texto}</span>
                  <button onClick={() => delCheck(item.id)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 2, display: 'flex', opacity: 0.5 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCheck()}
                placeholder="Nova etapa ou item…" style={{ ...inputStyle, flex: 1, fontSize: 12 }} aria-label="Novo item de checklist" />
              <button onClick={addCheck} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0E1116', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Comentários */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <MessageSquare size={14} style={{ color: '#C9A96E' }} /> Comentários
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.comentarios?.map(c => (
                <div key={c.id} style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', border: '1px solid #F1F5F9', position: 'relative' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0E1116', marginBottom: 3 }}>{c.autor} <span style={{ fontWeight: 400, color: '#94a3b8' }}>· {timeFmt(c.criado_em)}</span></div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.conteudo}</div>
                  <button onClick={() => delComment(c.id)} style={{ position: 'absolute', top: 6, right: 6, border: 0, background: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 2, display: 'flex' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                placeholder="Adicionar comentário…" style={{ ...inputStyle, flex: 1, fontSize: 12 }} aria-label="Novo comentário" />
              <button onClick={addComment} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0E1116', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* Anexos / Links */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Paperclip size={14} style={{ color: '#C9A96E' }} /> Links & Arquivos
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.anexos?.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff' }}>
                  <Link size={13} style={{ color: '#C9A96E', flexShrink: 0 }} />
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: '#3B82F6', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.nome}
                  </a>
                  <ExternalLink size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <button onClick={() => delAnex(a.id)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 2, display: 'flex', flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <input value={newAnexNome} onChange={e => setNewAnexNome(e.target.value)} placeholder="Nome (opcional)" style={{ ...inputStyle, flex: '0 0 140px', fontSize: 12 }} />
              <input value={newAnexUrl} onChange={e => setNewAnexUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAnex()} placeholder="URL do link ou arquivo…" style={{ ...inputStyle, flex: 1, fontSize: 12 }} aria-label="URL do anexo" />
              <button onClick={addAnex} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0E1116', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                <Plus size={13} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// MARCENEIROS (equipe da oficina)
// ═══════════════════════════════════════════════════════════════

// Avatar redondo com iniciais (ou foto se houver)
function MarcenaroAvatar({ marceneiro, size = 28, legacy = false }) {
  if (!marceneiro) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: legacy ? '#94a3b8' : '#E2E8F0',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.38), fontWeight: 700, flexShrink: 0,
      }}>—</div>
    );
  }
  const cor = marceneiro.cor || '#C9A96E';
  const iniciais = (marceneiro.nome || '').split(' ').filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase()).join('') || '·';
  if (marceneiro.foto) {
    return (
      <img src={marceneiro.foto} alt={marceneiro.nome}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${cor}`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: cor, color: '#0b0e13',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 800, flexShrink: 0,
      lineHeight: 1,
    }} title={marceneiro.nome}>{iniciais}</div>
  );
}

// Picker: seleciona marceneiro. Compact quando colapsado, abre lista.
function MarcenaroPicker({ value, onChange, team, placeholder = 'Atribuir marceneiro…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = team.find(m => m.id === value);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8,
          background: '#FAFAFA', cursor: 'pointer', textAlign: 'left',
        }}>
        <MarcenaroAvatar marceneiro={selected} size={26} />
        <span style={{ flex: 1, fontSize: 13, color: selected ? '#0F172A' : '#94a3b8', fontWeight: selected ? 600 : 400 }}>
          {selected?.nome || placeholder}
        </span>
        {selected && (
          <span role="button" aria-label="Remover atribuição"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            style={{ color: '#CBD5E1', display: 'flex', padding: 2 }}><X size={13} /></span>
        )}
        <ChevronRight size={13} style={{ color: '#94a3b8', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 1000,
          maxHeight: 260, overflowY: 'auto', padding: 4,
        }}>
          {team.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              Nenhum marceneiro cadastrado.<br/>Use "Equipe" para cadastrar.
            </div>
          ) : (
            <>
              <button type="button" onClick={() => { onChange(null); setOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', border: 0, background: 'transparent', cursor: 'pointer', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
                <div style={{ width: 26, height: 26 }} />— sem atribuição —
              </button>
              {team.map(m => (
                <button key={m.id} type="button" onClick={() => { onChange(m.id); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 9px', border: 0, background: value === m.id ? '#F1F5F9' : 'transparent',
                    cursor: 'pointer', borderRadius: 6, textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = value === m.id ? '#F1F5F9' : 'transparent'}>
                  <MarcenaroAvatar marceneiro={m} size={26} />
                  <span style={{ flex: 1, fontSize: 13, color: '#0F172A', fontWeight: value === m.id ? 700 : 500 }}>{m.nome}</span>
                  {m.especialidade && <span style={{ fontSize: 10, color: '#94a3b8' }}>{m.especialidade}</span>}
                  {value === m.id && <Check size={13} style={{ color: '#10B981' }} />}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Modal de gestão da equipe (CRUD)
function TeamModal({ onClose, onSaved, notify }) {
  const [team, setTeam]   = useState([]);
  const [editing, setEditing] = useState(null); // null|object (blank=new)
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    japi('/marceneiros/list?todos=1').then(d => { if (Array.isArray(d)) setTeam(d); }).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const h = e => e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, editing]);

  const saveOne = async (m) => {
    if (!m.nome?.trim()) return notify?.('error', 'Nome obrigatório');
    try {
      if (m.id) {
        await japi(`/marceneiros/list/${m.id}`, { method: 'PUT', body: JSON.stringify(m) });
        notify?.('success', `${m.nome} atualizado`);
      } else {
        await japi('/marceneiros/list', { method: 'POST', body: JSON.stringify(m) });
        notify?.('success', `${m.nome} adicionado à equipe`);
      }
      setEditing(null);
      load();
      onSaved?.();
    } catch (e) { notify?.('error', 'Erro ao salvar'); }
  };

  const delOne = async (m) => {
    if (!confirm(`Remover ${m.nome} da equipe? Cards atribuídos ficarão sem responsável.`)) return;
    try {
      await japi(`/marceneiros/list/${m.id}`, { method: 'DELETE' });
      notify?.('success', `${m.nome} removido`);
      load();
      onSaved?.();
    } catch { notify?.('error', 'Erro ao remover'); }
  };

  const inp = { border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Equipe da oficina"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Equipe da Oficina</h3>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cadastre os marceneiros que aparecem nos cards</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
          ) : team.length === 0 && !editing ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <User size={36} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Sem marceneiros cadastrados</div>
              <div style={{ fontSize: 12 }}>Adicione sua equipe pra atribuir cards no kanban</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {team.map(m => (
                editing?.id === m.id ? (
                  <TeamRowForm key={m.id} initial={m} onCancel={() => setEditing(null)} onSave={saveOne} />
                ) : (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10,
                    background: m.ativo ? '#fff' : '#F8FAFC', opacity: m.ativo ? 1 : 0.6,
                  }}>
                    <MarcenaroAvatar marceneiro={m} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                        {m.nome}{!m.ativo && <span style={{ fontSize: 10, marginLeft: 6, color: '#94a3b8', fontWeight: 500 }}>(inativo)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {m.especialidade || 'Marceneiro'}
                        {m.total_cards > 0 && <span style={{ marginLeft: 8 }}>· {m.total_cards} card{m.total_cards > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <button onClick={() => setEditing(m)} title="Editar"
                      style={{ padding: 7, border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => delOne(m)} title="Remover"
                      style={{ padding: 7, border: '1px solid #FEE2E2', borderRadius: 7, background: '#fff', cursor: 'pointer', color: '#EF4444', display: 'flex' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              ))}

              {editing && !editing.id && (
                <TeamRowForm initial={editing} onCancel={() => setEditing(null)} onSave={saveOne} />
              )}
            </div>
          )}

          {!editing && (
            <button onClick={() => setEditing({ nome: '', cor: PROJ_COLORS[team.length % PROJ_COLORS.length], foto: '', especialidade: '', ativo: 1 })}
              style={{
                marginTop: 10, width: '100%', padding: '10px', border: '1px dashed #CBD5E1', borderRadius: 10,
                background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <Plus size={14} /> Adicionar marceneiro
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TeamRowForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({ ...initial });
  const inp = { border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' };
  return (
    <div style={{ padding: 12, border: `2px solid ${form.cor || '#C9A96E'}`, borderRadius: 10, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MarcenaroAvatar marceneiro={form} size={44} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input autoFocus value={form.nome || ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Nome *" style={inp} />
          <input value={form.especialidade || ''} onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))}
            placeholder="Função (corte, cola…)" style={inp} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Cor / identidade visual</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PROJ_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm(f => ({ ...f, cor: c }))}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: form.cor === c ? '3px solid #0F172A' : '2px solid transparent', cursor: 'pointer', boxSizing: 'border-box' }}
              title={c} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {initial.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked ? 1 : 0 }))} />
            Ativo
          </label>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>Cancelar</button>
          <button type="button" onClick={() => onSave(form)}
            style={{ padding: '7px 14px', border: 0, borderRadius: 7, background: '#0E1116', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {initial.id ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: novo card ──────────────────────────────────────────
function NewCardModal({ initialEtapa, onClose, onCreate, notify, team }) {
  const [form, setForm] = useState({ ambiente: '', etapa: initialEtapa, cor: '#C9A96E', projeto_nome: '', cliente_nome: '', responsavel: '', prazo: '', descricao: '' });
  const [projList, setProjList] = useState([]);
  const [saving, setSaving]    = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    japi('/util/projetos').then(d => Array.isArray(d) && setProjList(d));
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.ambiente.trim()) return;
    setSaving(true);
    try {
      const card = await japi('', { method: 'POST', body: JSON.stringify(form) });
      onCreate(card);
      notify && notify('success', `Card "${card.ambiente}" criado`);
      onClose();
    } finally { setSaving(false); }
  };

  const inp = { border: '1px solid #E2E8F0', borderRadius: 7, padding: '9px 11px', fontSize: 13, outline: 'none', width: '100%', background: '#FAFAFA', boxSizing: 'border-box' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Novo card" className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Novo card na Oficina</h3>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Etapa */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Etapa inicial *</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {ETAPAS.map(e => (
                <button key={e.id} type="button" onClick={() => setForm(f => ({ ...f, etapa: e.id }))}
                  style={{ padding: '5px 12px', borderRadius: 99, border: `1.5px solid ${form.etapa === e.id ? e.col : '#E2E8F0'}`, background: form.etapa === e.id ? `${e.col}15` : '#fff', color: form.etapa === e.id ? e.col : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {e.short}
                </button>
              ))}
            </div>
          </div>

          {/* Ambiente */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Ambiente *</label>
            <input ref={ref} required value={form.ambiente} onChange={e => setForm(f => ({ ...f, ambiente: e.target.value }))}
              placeholder="Ex: Cozinha completa, Closet quarto 1…" style={inp} />
          </div>

          {/* Projeto */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Projeto (opcional)</label>
            <select value={form.projeto_id || ''} onChange={e => {
              const p = projList.find(x => String(x.id) === e.target.value);
              setForm(f => ({ ...f, projeto_id: p?.id || null, projeto_nome: p?.nome || '', cliente_nome: p?.cliente_nome || '' }));
            }} style={inp}>
              <option value="">— sem vínculo —</option>
              {projList.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cliente_nome ? ` (${p.cliente_nome})` : ''}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Marceneiro</label>
              <MarcenaroPicker value={form.marceneiro_id} onChange={id => setForm(f => ({ ...f, marceneiro_id: id }))} team={team || []} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Prazo</label>
              <input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Cor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Cor do projeto</label>
            <div style={{ display: 'flex', gap: 7 }}>
              {PROJ_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, cor: c }))}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: form.cor === c ? '3px solid #0F172A' : '2px solid transparent', cursor: 'pointer', boxSizing: 'border-box', flexShrink: 0 }} />
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving || !form.ambiente.trim()}
            style={{ padding: '11px', border: 0, borderRadius: 9, background: '#0E1116', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (saving || !form.ambiente.trim()) ? 0.5 : 1, marginTop: 4 }}>
            {saving ? 'Criando…' : 'Criar card'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// AÇÕES NO TV — toque no card abre botões touch-friendly
// ═══════════════════════════════════════════════════════════════

// Ordem das etapas pra saber "próxima"
const ETAPA_ORDER = ETAPAS.map(e => e.id);

function nextEtapa(atual) {
  const i = ETAPA_ORDER.indexOf(atual);
  return i >= 0 && i < ETAPA_ORDER.length - 1 ? ETAPA_ORDER[i + 1] : null;
}

// Status labels / cores
const STATUS_CFG = {
  pendente:  { label: 'Não iniciado', color: '#64748b', bg: '#1e2530' },
  ativo:     { label: 'Em andamento', color: '#10B981', bg: '#10B98120' },
  pausado:   { label: 'Pausado',      color: '#F59E0B', bg: '#F59E0B20' },
  bloqueado: { label: 'Bloqueado',    color: '#EF4444', bg: '#EF444420' },
};

function TVCardActions({ card, onClose, onUpdate, onMove }) {
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo]   = useState('');
  const [showBloquear, setShowBloquear] = useState(false);

  const proxEtapa = nextEtapa(card.etapa);
  const proxEtapaInfo = proxEtapa ? ETAPA_MAP[proxEtapa] : null;
  const sc = STATUS_CFG[card.status] || STATUS_CFG.pendente;

  // Fecha no Escape
  useEffect(() => {
    const h = e => e.key === 'Escape' && !showBloquear && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, showBloquear]);

  const acao = async (tipo, extra = {}) => {
    setLoading(true);
    try {
      const updated = await japi(`/${card.id}/status`, { method: 'PATCH', body: JSON.stringify({ acao: tipo, ...extra }) });
      onUpdate(updated);
      if (tipo !== 'bloquear') onClose();
    } finally { setLoading(false); }
  };

  const finalizar = async () => {
    setLoading(true);
    try {
      if (proxEtapa) {
        await japi(`/${card.id}/etapa`, { method: 'PATCH', body: JSON.stringify({ etapa: proxEtapa }) });
        onMove(card.id, proxEtapa);
      }
      onClose();
    } finally { setLoading(false); }
  };

  const btnBase = {
    border: 0, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, fontSize: 18, padding: '18px 24px', width: '100%',
    transition: 'opacity 0.15s, transform 0.1s',
    minHeight: 64,
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#141920', borderRadius: 20, width: '100%', maxWidth: 480, border: `2px solid ${card.cor || '#C9A96E'}33`, overflow: 'hidden' }}
      >
        {/* Header do card */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #1e2530' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#F8FAFC', lineHeight: 1.15 }}>{card.ambiente}</div>
              {card.marceneiro_nome && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: card.marceneiro_cor || '#C9A96E',
                    color: '#0b0e13', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, flexShrink: 0,
                  }}>
                    {(card.marceneiro_nome || '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{card.marceneiro_nome}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: ETAPA_MAP[card.etapa]?.col, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {ETAPA_MAP[card.etapa]?.label}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, padding: '3px 8px', borderRadius: 6, background: sc.bg, color: sc.color, fontWeight: 700 }}>
                {sc.label}
              </div>
            </div>
          </div>
          {card.bloqueio_motivo && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#EF444415', border: '1px solid #EF444433', borderRadius: 8, fontSize: 12, color: '#EF4444' }}>
              🛑 {card.bloqueio_motivo}
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showBloquear ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC', marginBottom: 4 }}>Motivo do bloqueio:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                {['Aguardando material','Decisão do cliente','Máquina quebrada','Faltou acessório'].map(m => (
                  <button key={m} onClick={() => setMotivo(m)} style={{
                    ...btnBase, fontSize: 12, minHeight: 46, padding: '10px 12px',
                    background: motivo === m ? '#EF444430' : '#1e2530',
                    color: motivo === m ? '#EF4444' : '#94a3b8',
                    border: motivo === m ? '2px solid #EF444466' : '2px solid transparent',
                  }}>{m}</button>
                ))}
              </div>
              <input value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ou descreva o motivo…"
                style={{ padding: '12px 14px', border: '1px solid #2a3040', borderRadius: 10, background: '#0b0e13', color: '#F8FAFC', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowBloquear(false)} style={{ ...btnBase, background: '#1e2530', color: '#64748b', flex: 1, fontSize: 14 }}>Cancelar</button>
                <button onClick={() => acao('bloquear', { motivo })} disabled={!motivo.trim() || loading}
                  style={{ ...btnBase, background: '#EF4444', color: '#fff', flex: 2, fontSize: 14, opacity: (!motivo.trim() || loading) ? 0.5 : 1 }}>
                  <Lock size={16} /> Confirmar bloqueio
                </button>
              </div>
            </>
          ) : (
            <>
              {/* INICIAR / RETOMAR */}
              {(card.status === 'pendente' || card.status === 'pausado') && (
                <button onClick={() => acao(card.status === 'pausado' ? 'retomar' : 'iniciar')} disabled={loading}
                  style={{ ...btnBase, background: '#10B981', color: '#fff', opacity: loading ? 0.6 : 1 }}>
                  <Play size={24} fill="#fff" />
                  {card.status === 'pausado' ? 'RETOMAR' : 'INICIAR'}
                </button>
              )}

              {/* PAUSAR */}
              {card.status === 'ativo' && (
                <button onClick={() => acao('pausar')} disabled={loading}
                  style={{ ...btnBase, background: '#1e2530', border: '2px solid #F59E0B44', color: '#F59E0B', opacity: loading ? 0.6 : 1 }}>
                  <Pause size={24} /> PAUSAR
                </button>
              )}

              {/* DESBLOQUEAR */}
              {card.status === 'bloqueado' && (
                <button onClick={() => acao('desbloquear')} disabled={loading}
                  style={{ ...btnBase, background: '#10B98120', border: '2px solid #10B98144', color: '#10B981', opacity: loading ? 0.6 : 1 }}>
                  <Unlock size={24} /> DESBLOQUEAR
                </button>
              )}

              {/* FINALIZAR → próxima etapa */}
              {proxEtapaInfo && card.status !== 'bloqueado' && (
                <button onClick={finalizar} disabled={loading}
                  style={{ ...btnBase, background: `${proxEtapaInfo.col}22`, border: `2px solid ${proxEtapaInfo.col}55`, color: proxEtapaInfo.col, opacity: loading ? 0.6 : 1 }}>
                  <CheckCircle size={24} />
                  <span>FINALIZAR <span style={{ fontSize: 13, opacity: 0.8 }}>→ {proxEtapaInfo.short}</span></span>
                </button>
              )}

              {/* CONCLUÍDO (expedição → marca como concluído) */}
              {!proxEtapaInfo && card.status !== 'bloqueado' && (
                <button onClick={() => acao('pausar')} disabled={loading}
                  style={{ ...btnBase, background: '#10B98120', border: '2px solid #10B98144', color: '#10B981', opacity: loading ? 0.6 : 1 }}>
                  <CheckCircle size={24} /> MARCAR CONCLUÍDO
                </button>
              )}

              {/* BLOQUEAR */}
              {card.status !== 'bloqueado' && (
                <button onClick={() => setShowBloquear(true)}
                  style={{ ...btnBase, background: 'transparent', color: '#475569', fontSize: 13, minHeight: 44, padding: '10px 16px' }}>
                  <Lock size={16} /> Bloquear (aguardando algo)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES DE CHECKLIST — modal de configuração
// ═══════════════════════════════════════════════════════════════
function TemplatesModal({ onClose, notify }) {
  const [templates, setTemplates] = useState([]);
  const [activeEtapa, setActiveEtapa] = useState(ETAPAS[0].id);
  const [newText, setNewText]       = useState('');
  const [editId, setEditId]         = useState(null);
  const [editText, setEditText]     = useState('');

  const load = () => japi('/templates/checklist').then(d => Array.isArray(d) && setTemplates(d));
  useEffect(() => {
    load();
    const h = e => e.key === 'Escape' && !editId && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, editId]);

  const byEtapa = templates.filter(t => t.etapa === activeEtapa);

  const addItem = async () => {
    if (!newText.trim()) return;
    await japi('/templates/checklist', { method: 'POST', body: JSON.stringify({ etapa: activeEtapa, texto: newText }) });
    setNewText('');
    load();
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    await japi(`/templates/checklist/${editId}`, { method: 'PUT', body: JSON.stringify({ texto: editText }) });
    setEditId(null); setEditText(''); load();
  };

  const del = async (id) => {
    await japi(`/templates/checklist/${id}`, { method: 'DELETE' });
    load();
  };

  const inp = { border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Templates de Checklist"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Templates de Checklist</h3>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Itens aplicados automaticamente ao criar ou mover um card para cada etapa
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
        </div>

        {/* Abas de etapa */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', flexShrink: 0 }}>
          {ETAPAS.map(e => {
            const { Icon } = e;
            const count = templates.filter(t => t.etapa === e.id).length;
            return (
              <button key={e.id} onClick={() => { setActiveEtapa(e.id); setEditId(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 0,
                  background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeEtapa === e.id ? 700 : 500,
                  color: activeEtapa === e.id ? e.col : '#94a3b8',
                  borderBottom: activeEtapa === e.id ? `2px solid ${e.col}` : '2px solid transparent',
                  flexShrink: 0, marginBottom: -1,
                }}>
                <Icon size={13} />
                {e.short}
                {count > 0 && (
                  <span style={{ background: `${e.col}20`, color: e.col, fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Lista de itens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {byEtapa.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <CheckSquare size={32} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Sem itens para esta etapa</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Adicione abaixo. Serão aplicados automaticamente em novos cards.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {byEtapa.map((t, idx) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 12, color: '#CBD5E1', fontVariantNumeric: 'tabular-nums', width: 18, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                  {editId === t.id ? (
                    <>
                      <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                        style={{ ...inp, flex: 1, padding: '5px 8px' }} />
                      <button onClick={saveEdit} style={{ border: 0, background: '#10B981', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 700 }}>OK</button>
                      <button onClick={() => setEditId(null)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{t.texto}</span>
                      <button onClick={() => { setEditId(t.id); setEditText(t.texto); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 4, display: 'flex' }}><Edit2 size={13} /></button>
                      <button onClick={() => del(t.id)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 4, display: 'flex' }}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adicionar item */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 8 }}>
          <input value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder={`Novo item para ${ETAPA_MAP[activeEtapa]?.short}…`}
            style={{ ...inp, flex: 1 }} />
          <button onClick={addItem} disabled={!newText.trim()}
            style={{ padding: '9px 16px', border: 0, borderRadius: 8, background: ETAPA_MAP[activeEtapa]?.col || '#0E1116', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !newText.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Desktop principal ─────────────────────────────────────────
function OficinaDesktop({ notify }) {
  const [cards, setCards]         = useState([]);
  const [team, setTeam]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [openId, setOpenId]       = useState(null);
  const [newCardEtapa, setNewCardEtapa] = useState(null);
  const [showTeam, setShowTeam]       = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filterProj, setFilterProj] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [activeId, setActiveId]   = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      japi('').then(d => Array.isArray(d) && setCards(d)),
      japi('/marceneiros/list').then(d => Array.isArray(d) && setTeam(d)),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const reloadTeam = () => japi('/marceneiros/list').then(d => Array.isArray(d) && setTeam(d));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = useCallback(async ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    // Descobre a coluna de destino
    const overIsColumn = ETAPAS.some(e => e.id === over.id);
    const targetEtapa  = overIsColumn
      ? over.id
      : cards.find(c => c.id === over.id)?.etapa;

    if (!targetEtapa) return;

    const srcCard = cards.find(c => c.id === active.id);
    if (!srcCard || srcCard.etapa === targetEtapa) return;

    // Optimistic update
    setCards(prev => prev.map(c => c.id === active.id ? { ...c, etapa: targetEtapa } : c));
    try {
      await japi(`/${active.id}/etapa`, { method: 'PATCH', body: JSON.stringify({ etapa: targetEtapa }) });
      notify && notify('success', `"${srcCard.ambiente}" → ${ETAPA_MAP[targetEtapa]?.short}`);
    } catch {
      setCards(prev => prev.map(c => c.id === active.id ? { ...c, etapa: srcCard.etapa } : c));
      notify && notify('error', 'Erro ao mover card');
    }
  }, [cards, notify]);

  // Filtragem
  const projetos = useMemo(() => [...new Set(cards.map(c => c.projeto_nome).filter(Boolean))], [cards]);

  const filtered = cards.filter(c =>
    (!filterProj || c.projeto_nome === filterProj) &&
    (!filterResp || String(c.marceneiro_id) === filterResp || c.responsavel === filterResp)
  );

  const byEtapa  = (etapaId) => filtered.filter(c => c.etapa === etapaId);
  const activeCard = cards.find(c => c.id === activeId);

  const openTV = () => {
    // Abre /oficina_tv na nova aba — o App.jsx lê o pathname e renderiza OficinaTVMode
    const url = `${window.location.origin}/oficina_tv`;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) window.location.assign(url); // fallback se popup bloqueado
  };

  const totalEmProd = cards.filter(c => c.etapa !== 'expedicao').length;
  const prontos     = cards.filter(c => c.etapa === 'expedicao').length;
  const atrasados   = cards.filter(c => c.prazo && new Date(c.prazo + 'T12:00:00') < new Date()).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F1F5F9' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0E1116', display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 20 }}>🏭</span> Oficina
            </h1>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Kanban de produção do chão de fábrica</div>
          </div>

          {/* Stats rápidas */}
          <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              <span style={{ fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{totalEmProd}</span> em produção
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              <span style={{ fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{prontos}</span> prontos p/ expedir
            </span>
            {atrasados > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: '#FEF2F2', padding: '3px 9px', borderRadius: 99 }}>
                <AlertCircle size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                {atrasados} atrasado{atrasados > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Filtros */}
          {(projetos.length > 0 || team.length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={13} style={{ color: '#94a3b8' }} aria-hidden="true" />
              {projetos.length > 0 && (
                <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#FAFAFA', outline: 'none', color: '#334155' }}>
                  <option value="">Todos os projetos</option>
                  {projetos.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {team.length > 0 && (
                <select value={filterResp} onChange={e => setFilterResp(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#FAFAFA', outline: 'none', color: '#334155' }}>
                  <option value="">Todos os marceneiros</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={load} title="Atualizar" style={{ padding: '8px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setShowTemplates(true)} title="Templates de checklist por etapa"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334155' }}>
              <Settings size={14} /> Templates
            </button>
            <button onClick={() => setShowTeam(true)} title="Gerenciar equipe"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334155' }}>
              <User size={14} /> Equipe
              {team.length > 0 && (
                <span style={{ background: '#C9A96E22', color: '#8B6F47', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' }}>{team.length}</span>
              )}
            </button>
            <button onClick={openTV}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334155' }}>
              <Monitor size={14} /> Modo TV
            </button>
            <button onClick={() => setNewCardEtapa('corte')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 0, borderRadius: 8, background: '#0E1116', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              <Plus size={14} /> Novo card
            </button>
          </div>
        </div>
      </div>

      {/* ── Board ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#94a3b8', gap: 10, fontSize: 13 }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando Oficina…
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={handleDragEnd}>
            <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 160px)', minWidth: 'max-content' }}>
              {ETAPAS.map(etapa => (
                <KanbanColumn key={etapa.id} etapa={etapa} cards={byEtapa(etapa.id)} onOpen={setOpenId} onAddCard={setNewCardEtapa} />
              ))}
            </div>
            <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeCard && <CardContent card={activeCard} onOpen={() => {}} />}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── Modais ───────────────────────────────────────────── */}
      {openId && (
        <CardModal
          cardId={openId} cards={cards} onClose={() => setOpenId(null)}
          onUpdate={updated => setCards(prev => prev.map(c => c.id === updated.id ? { ...updated } : c))}
          onDelete={id => setCards(prev => prev.filter(c => c.id !== id))}
          notify={notify}
          team={team}
        />
      )}
      {newCardEtapa && (
        <NewCardModal
          initialEtapa={newCardEtapa}
          onClose={() => setNewCardEtapa(null)}
          onCreate={card => setCards(prev => [...prev, card])}
          notify={notify}
          team={team}
        />
      )}
      {showTeam && (
        <TeamModal
          onClose={() => setShowTeam(false)}
          onSaved={() => { reloadTeam(); load(); }}
          notify={notify}
        />
      )}
      {showTemplates && (
        <TemplatesModal onClose={() => setShowTemplates(false)} notify={notify} />
      )}
    </div>
  );
}

// ─── Modo TV — painel de chão de fábrica ───────────────────────
function TVCard({ card, onClick }) {
  const age = ageDot(card.atualizado_em || card.criado_em);
  const pz  = prazoClass(card.prazo);
  const e   = ETAPA_MAP[card.etapa];
  const sc  = STATUS_CFG[card.status] || STATUS_CFG.pendente;
  const projCor = card.cor || '#C9A96E';

  // Prioriza marceneiro cadastrado; fallback para campo texto legacy
  const marceneiroNome = card.marceneiro_nome || card.responsavel || '';
  const marceneiroCor  = card.marceneiro_cor  || projCor;
  const marceneiroFoto = card.marceneiro_foto || '';
  const hasMarceneiro  = !!marceneiroNome;

  // Iniciais p/ avatar (ex: "José Silva" → "JS")
  const iniciais = marceneiroNome.split(' ').filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase()).join('') || '—';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
      style={{
        background: '#141920',
        borderRadius: 12,
        borderLeft: `6px solid ${projCor}`,
        padding: '14px 16px',
        marginBottom: 10,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'filter 0.15s',
        outline: 'none',
      }}
      onMouseEnter={onClick ? e => e.currentTarget.style.filter = 'brightness(1.15)' : undefined}
      onMouseLeave={onClick ? e => e.currentTarget.style.filter = 'brightness(1)' : undefined}
    >
      {/* Status badge (topo direito) */}
      {card.status && card.status !== 'pendente' && (
        <div style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 99,
          background: sc.bg, color: sc.color,
        }}>{sc.label}</div>
      )}

      {/* linha topo: bolinha de idade + ambiente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasMarceneiro ? 10 : 4, paddingRight: card.status && card.status !== 'pendente' ? 80 : 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: age, flexShrink: 0 }} />
        <div style={{ fontWeight: 800, fontSize: 19, color: '#F8FAFC', lineHeight: 1.15, flex: 1, minWidth: 0 }}>
          {card.ambiente}
        </div>
      </div>

      {/* MARCENEIRO — destaque principal (visível do chão de fábrica) */}
      {hasMarceneiro ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: `linear-gradient(90deg, ${marceneiroCor}26 0%, ${marceneiroCor}0D 100%)`,
          border: `1px solid ${marceneiroCor}55`,
          borderRadius: 10,
          padding: '8px 10px',
          marginBottom: 8,
        }}>
          {marceneiroFoto ? (
            <img src={marceneiroFoto} alt={marceneiroNome}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${marceneiroCor}`, boxShadow: `0 0 0 2px #141920`, flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: marceneiroCor, color: '#0b0e13',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, flexShrink: 0,
              boxShadow: `0 0 0 2px #141920, 0 0 0 3px ${marceneiroCor}55`,
            }}>{iniciais}</div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', lineHeight: 1 }}>
              Marceneiro
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: '#F8FAFC',
              lineHeight: 1.15, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {marceneiroNome}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#ef4444',
          background: '#ef44441a', border: '1px dashed #ef444466',
          borderRadius: 8, padding: '6px 8px', marginBottom: 8, textAlign: 'center',
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>Sem responsável</div>
      )}

      {/* linha inferior: projeto · cliente + prazo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {card.projeto_nome && (
          <div style={{
            fontSize: 12, color: projCor, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          }}>
            {card.projeto_nome}{card.cliente_nome ? ` · ${card.cliente_nome}` : ''}
          </div>
        )}
        {pz && (
          <span style={{
            fontSize: 11, fontWeight: 800, color: pz.color,
            background: `${pz.color}1a`, padding: '3px 7px', borderRadius: 6,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>{dtFmt(card.prazo)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Mini Calendário de Prazos (TV sidebar) ───────────────────
function TVCalendar({ cards }) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  // 0=Dom…6=Sab; ajusta para semana começar na segunda (0=Seg)
  const firstDow     = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthName    = now.toLocaleDateString('pt-BR', { month: 'long' });

  // Agrupa prazos por dia do mês atual
  const byDay = {};
  cards.forEach(c => {
    if (!c.prazo) return;
    const d = new Date(c.prazo + 'T12:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(c);
  });

  // Próximos 30 dias com prazo (para a lista)
  const upcoming = cards
    .filter(c => c.prazo)
    .map(c => {
      const diff = Math.floor((new Date(c.prazo + 'T12:00:00') - now) / 86400000);
      return { ...c, diff };
    })
    .filter(c => c.diff >= -1 && c.diff <= 30)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 8);

  const dayColor = (d) => {
    const items = byDay[d] || [];
    if (!items.length) return null;
    const diffs = items.map(c => Math.floor((new Date(c.prazo + 'T12:00:00') - now) / 86400000));
    const min = Math.min(...diffs);
    if (min < 0)  return '#EF4444';
    if (min === 0) return '#F97316';
    if (min <= 3)  return '#F59E0B';
    return '#C9A96E';
  };

  const DAYS_HEADER = ['S','T','Q','Q','S','S','D'];

  // Células: padding inicial + dias do mês
  const cells = Array(firstDow).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  // Completar última semana
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Título mês */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#C9A96E', textTransform: 'capitalize', letterSpacing: '0.06em' }}>
          {monthName} {year}
        </span>
      </div>

      {/* Grid cabeçalho dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
        {DAYS_HEADER.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#3a4555', paddingBottom: 3 }}>{d}</div>
        ))}
      </div>

      {/* Grid dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const color = dayColor(d);
          const isToday = d === today;
          const count = (byDay[d] || []).length;
          return (
            <div key={d} style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              width: '100%', aspectRatio: '1',
              borderRadius: 4,
              background: isToday ? '#1e2d40' : color ? `${color}18` : 'transparent',
              border: isToday ? '1px solid #C9A96E' : color ? `1px solid ${color}40` : '1px solid transparent',
            }}>
              <span style={{
                fontSize: 10, fontWeight: isToday ? 800 : color ? 700 : 400,
                color: isToday ? '#C9A96E' : color ? color : '#475569',
                lineHeight: 1,
              }}>{d}</span>
              {count > 0 && (
                <div style={{
                  width: count > 1 ? 12 : 6, height: 3, borderRadius: 99,
                  background: color, marginTop: 2, flexShrink: 0,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[['#EF4444','Vencido'],['#F97316','Hoje'],['#F59E0B','≤3d'],['#C9A96E','Próximo']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#475569' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />{l}
          </span>
        ))}
      </div>

      {/* Divisor */}
      {upcoming.length > 0 && (
        <div style={{ borderTop: '1px solid #1e2530', margin: '12px 0 8px' }} />
      )}

      {/* Lista de prazos próximos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {upcoming.map(c => {
          const isPast  = c.diff < 0;
          const isToday2 = c.diff === 0;
          const col     = isPast ? '#EF4444' : isToday2 ? '#F97316' : c.diff <= 3 ? '#F59E0B' : '#C9A96E';
          const label   = isPast ? `${Math.abs(c.diff)}d atraso` : isToday2 ? 'Hoje' : c.diff === 1 ? 'Amanhã' : `${c.diff}d`;
          return (
            <div key={c.id} style={{
              background: '#141920', borderRadius: 6, padding: '6px 8px',
              borderLeft: `3px solid ${c.cor || col}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.ambiente}
                </div>
                {c.projeto_nome && (
                  <div style={{ fontSize: 9, color: c.cor || '#C9A96E', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.projeto_nome}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, color: col, whiteSpace: 'nowrap', background: `${col}15`, padding: '2px 5px', borderRadius: 4 }}>
                {label}
              </span>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#2a3040', padding: '8px 0' }}>Sem prazos próximos</div>
        )}
      </div>
    </div>
  );
}

// ─── Painel de Marceneiros (TV — alterna com kanban) ──────────
function TVMarceneirosPanel({ team, cards, onCardClick }) {
  const [, setTick] = useState(0);
  // Tick a cada 30s pra atualizar a duração "trabalhando há X"
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  // Para cada marceneiro: card atual (mais recentemente mexido, não expedido), próximo da fila, total de cards
  const rows = team.map(m => {
    const meus = cards.filter(c => c.marceneiro_id === m.id);
    const ativos = meus.filter(c => c.etapa !== 'expedicao');
    const atual = ativos.slice().sort((a, b) => new Date(b.atualizado_em) - new Date(a.atualizado_em))[0] || null;
    const proximos = ativos.filter(c => c.id !== atual?.id)
      .sort((a, b) => {
        // ordena: com prazo primeiro (mais próximo), depois sem prazo
        if (a.prazo && !b.prazo) return -1;
        if (!a.prazo && b.prazo) return 1;
        if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
        return 0;
      });
    // status: com atual → "trabalhando", sem ativos → "sem tarefa"
    let status = 'sem_tarefa';
    let duracao = '';
    if (atual) {
      status = 'trabalhando';
      const mins = Math.floor((Date.now() - new Date(atual.atualizado_em)) / 60000);
      if (mins < 60)         duracao = `${mins}min`;
      else if (mins < 1440)  duracao = `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
      else                   duracao = `${Math.floor(mins / 1440)}d parado`;
      // se passou muito tempo sem atualização = parado
      if (mins > 180) status = 'parado';
    }
    return { m, atual, proximos, status, duracao, total: ativos.length };
  });

  const statusStyle = {
    trabalhando: { label: 'TRABALHANDO',  bg: '#10B98120', color: '#10B981', border: '#10B98144' },
    parado:      { label: 'SEM MEXER', bg: '#F97316',   color: '#fff',    border: '#F97316',    pulse: true },
    sem_tarefa:  { label: 'SEM TAREFA',   bg: '#EF444420', color: '#EF4444', border: '#EF444444', pulse: true },
  };

  if (rows.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#475569' }}>
        <User size={48} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>Nenhum marceneiro cadastrado</div>
        <div style={{ fontSize: 12 }}>Cadastre a equipe no modo desktop → botão "Equipe"</div>
      </div>
    );
  }

  // Grid adaptativo: até 5 colunas
  const cols = rows.length <= 5 ? rows.length : rows.length <= 10 ? 5 : 6;

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '14px 16px',
      display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12,
      alignContent: 'start',
    }}>
      {rows.map(({ m, atual, proximos, status, duracao, total }) => {
        const st = statusStyle[status];
        return (
          <div key={m.id} style={{
            background: '#141920',
            border: `2px solid ${st.border}`,
            borderRadius: 14,
            padding: '14px 14px 12px',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
            animation: st.pulse ? 'tvPulseBorder 2s ease-in-out infinite' : 'none',
          }}>
            {/* Header do marceneiro */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {m.foto ? (
                <img src={m.foto} alt={m.nome}
                  style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${m.cor || '#C9A96E'}`, flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: m.cor || '#C9A96E', color: '#0b0e13',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 800, flexShrink: 0,
                  boxShadow: `0 0 0 3px #141920, 0 0 0 4px ${(m.cor || '#C9A96E')}44`,
                }}>{(m.nome || '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.nome}
                </div>
                {m.especialidade && (
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.especialidade}</div>
                )}
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
              padding: '4px 8px', borderRadius: 6,
              background: st.bg, color: st.color,
              textAlign: 'center', marginBottom: 10,
            }}>{st.label}{duracao ? ` · ${duracao}` : ''}</div>

            {/* Card atual — clicável pra abrir ações */}
            {atual ? (
              <div
                onClick={() => onCardClick?.(atual.id)}
                role={onCardClick ? 'button' : undefined}
                tabIndex={onCardClick ? 0 : undefined}
                onKeyDown={onCardClick ? e => e.key === 'Enter' && onCardClick(atual.id) : undefined}
                style={{
                  background: `${(atual.cor || '#C9A96E')}18`,
                  borderLeft: `4px solid ${atual.cor || '#C9A96E'}`,
                  borderRadius: 8, padding: '8px 10px', marginBottom: 8,
                  cursor: onCardClick ? 'pointer' : 'default',
                  transition: 'filter 0.15s', outline: 'none',
                }}
                onMouseEnter={onCardClick ? e => e.currentTarget.style.filter = 'brightness(1.2)' : undefined}
                onMouseLeave={onCardClick ? e => e.currentTarget.style.filter = 'brightness(1)' : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: ETAPA_MAP[atual.etapa]?.col, letterSpacing: 0.6 }}>
                    {ETAPA_MAP[atual.etapa]?.label || atual.etapa}
                  </span>
                  {atual.status && atual.status !== 'pendente' && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: STATUS_CFG[atual.status]?.color, letterSpacing: 0.4 }}>
                      {STATUS_CFG[atual.status]?.label?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#F8FAFC', lineHeight: 1.2 }}>{atual.ambiente}</div>
                {atual.projeto_nome && (
                  <div style={{ fontSize: 10, color: atual.cor || '#C9A96E', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {atual.projeto_nome}
                  </div>
                )}
                {onCardClick && (
                  <div style={{ fontSize: 9, color: '#475569', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Toque para ações
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: '#0b0e13', border: '1px dashed #2a3040',
                borderRadius: 8, padding: '14px', marginBottom: 8,
                textAlign: 'center', fontSize: 11, color: '#475569', fontWeight: 600,
              }}>— sem tarefa atribuída —</div>
            )}

            {/* Próximos (max 2) */}
            {proximos.length > 0 && (
              <div>
                <div style={{ fontSize: 8, color: '#475569', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                  Próximos ({proximos.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {proximos.slice(0, 2).map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#94a3b8' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.cor || '#C9A96E', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.ambiente}</span>
                      <span style={{ fontSize: 8, color: ETAPA_MAP[c.etapa]?.col, fontWeight: 700 }}>{ETAPA_MAP[c.etapa]?.short}</span>
                    </div>
                  ))}
                  {proximos.length > 2 && (
                    <div style={{ fontSize: 9, color: '#475569', textAlign: 'center', marginTop: 2 }}>+{proximos.length - 2} mais</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes tvPulseBorder {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15); }
        }
      `}</style>
    </div>
  );
}

// ─── Modo TV ───────────────────────────────────────────────────
function OficinaTVMode() {
  const [cards, setCards]           = useState([]);
  const [team, setTeam]             = useState([]);
  const [clock, setClock]           = useState('');
  const [activeCardId, setActiveCardId] = useState(null);
  const [lastRefresh, setLastRefresh] = useState('');
  // Logo da empresa — lê do cache localStorage, busca da API em background
  const [logo, setLogo] = useState(() => localStorage.getItem('logo_sistema') || '');
  const [empNome, setEmpNome] = useState(() => localStorage.getItem('emp_nome') || 'Oficina');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [view, setView]             = useState('kanban'); // 'kanban' | 'team'
  const [autoRotate, setAutoRotate] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      japi('').then(d => Array.isArray(d) && setCards(d)),
      japi('/marceneiros/list').then(d => Array.isArray(d) && setTeam(d)),
    ]).finally(() => {
      setLastRefresh(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    });
  }, []);

  // Busca logo da empresa uma vez ao montar
  useEffect(() => {
    fetch('/api/config/empresa', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (d.logo_sistema) { setLogo(d.logo_sistema); localStorage.setItem('logo_sistema', d.logo_sistema); }
        if (d.nome)         { setEmpNome(d.nome);       localStorage.setItem('emp_nome', d.nome); }
      })
      .catch(() => {});
  }, []);

  // Polling + relógio
  useEffect(() => {
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [load]);

  // Auto-rotação entre kanban e painel de marceneiros (a cada 25s)
  useEffect(() => {
    if (!autoRotate || team.length === 0) return;
    const rot = setInterval(() => setView(v => v === 'kanban' ? 'team' : 'kanban'), 25000);
    return () => clearInterval(rot);
  }, [autoRotate, team.length]);

  useEffect(() => {
    const tick = setInterval(() =>
      setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    , 1000);
    return () => clearInterval(tick);
  }, []);

  // Auto-fullscreen ao montar
  useEffect(() => {
    const req = async () => {
      try {
        await document.documentElement.requestFullscreen?.();
        setIsFullscreen(true);
      } catch { /* usuário recusou ou browser bloqueou */ }
    };
    req();
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.();
    }
  };

  const totalEmProd = cards.filter(c => c.etapa !== 'expedicao').length;
  const prontos     = cards.filter(c => c.etapa === 'expedicao').length;
  const atrasados   = cards.filter(c => c.prazo && new Date(c.prazo + 'T12:00:00') < new Date()).length;

  return (
    <div style={{ background: '#0E1116', height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden' }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #1e2530', flexShrink: 0 }}>
        {/* Esquerda: título + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {logo ? (
            <img
              src={logo}
              alt={empNome}
              style={{ height: 36, maxWidth: 140, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            />
          ) : (
            <span style={{ fontSize: 17, fontWeight: 900, color: '#C9A96E', letterSpacing: '-0.02em' }}>{empNome}</span>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>
              <span style={{ fontWeight: 800, color: '#F8FAFC', fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{totalEmProd}</span>
              <span style={{ marginLeft: 4 }}>em prod.</span>
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>
              <span style={{ fontWeight: 800, color: '#10B981', fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{prontos}</span>
              <span style={{ marginLeft: 4 }}>p/ expedir</span>
            </span>
            {atrasados > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444' }}>
                <span style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{atrasados}</span>
                <span style={{ marginLeft: 4 }}>atrasado{atrasados > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>
        </div>

        {/* Direita: toggle views + relógio + fullscreen */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {/* Toggle: kanban ↔ equipe */}
          {team.length > 0 && (
            <div style={{ display: 'flex', gap: 4, background: '#1a1f28', borderRadius: 8, padding: 3 }}>
              <button
                onClick={() => { setView('kanban'); setAutoRotate(false); }}
                style={{
                  padding: '6px 12px', border: 0, borderRadius: 6, cursor: 'pointer',
                  background: view === 'kanban' ? '#C9A96E' : 'transparent',
                  color: view === 'kanban' ? '#0b0e13' : '#94a3b8',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                title="Exibir kanban de produção"
              >
                <FolderOpen size={11} />KANBAN
              </button>
              <button
                onClick={() => { setView('team'); setAutoRotate(false); }}
                style={{
                  padding: '6px 12px', border: 0, borderRadius: 6, cursor: 'pointer',
                  background: view === 'team' ? '#C9A96E' : 'transparent',
                  color: view === 'team' ? '#0b0e13' : '#94a3b8',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                title="Exibir painel de marceneiros"
              >
                <User size={11} />EQUIPE
              </button>
              <button
                onClick={() => setAutoRotate(a => !a)}
                title={autoRotate ? 'Pausar alternância automática' : 'Ativar alternância automática'}
                style={{
                  padding: '6px 10px', border: 0, borderRadius: 6, cursor: 'pointer',
                  background: autoRotate ? '#1e2530' : 'transparent',
                  color: autoRotate ? '#10B981' : '#475569',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <RefreshCw size={10} style={{ animation: autoRotate ? 'spin 4s linear infinite' : 'none' }} />
                {autoRotate ? 'AUTO' : 'OFF'}
              </button>
            </div>
          )}

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{clock}</div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
          </div>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair do modo tela cheia' : 'Tela cheia'}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
            style={{ border: '1px solid #1e2530', background: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#475569', display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#C9A96E'}
            onMouseLeave={e => e.currentTarget.style.color = '#475569'}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Body: kanban OU painel de equipe + sidebar ────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {view === 'kanban' ? (
          /* Colunas kanban */
          <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', padding: '10px 6px' }}>
            {ETAPAS.map(etapa => {
              const colCards = cards.filter(c => c.etapa === etapa.id);
              const { Icon } = etapa;
              return (
                <div key={etapa.id} style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', padding: '0 7px', borderRight: '1px solid #1e2530' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, paddingBottom: 7, borderBottom: `2px solid ${etapa.col}` }}>
                    <Icon size={13} style={{ color: etapa.col }} aria-hidden="true" />
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.1em' }}>{etapa.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: etapa.col, fontVariantNumeric: 'tabular-nums' }}>{colCards.length}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {colCards.map(card => <TVCard key={card.id} card={card} onClick={() => setActiveCardId(card.id)} />)}
                    {colCards.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#2a3040', fontSize: 11 }}>Sem cards</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Painel de Marceneiros */
          <TVMarceneirosPanel team={team} cards={cards} onCardClick={setActiveCardId} />
        )}

        {/* Sidebar: calendário de prazos */}
        <div style={{
          width: 204, flexShrink: 0,
          borderLeft: '1px solid #1e2530',
          background: '#0b0e13',
          padding: '12px 10px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header sidebar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1e2530' }}>
            <Calendar size={12} style={{ color: '#C9A96E' }} aria-hidden="true" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#C9A96E', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Prazos</span>
          </div>
          <TVCalendar cards={cards} />
          <div style={{ marginTop: 'auto', paddingTop: 10, fontSize: 8, color: '#1e2530', textAlign: 'center' }}>
            ↻ {lastRefresh}
          </div>
        </div>
      </div>

      {/* Modal de ações ao tocar num card */}
      {activeCardId && (() => {
        const ac = cards.find(c => c.id === activeCardId);
        if (!ac) return null;
        return (
          <TVCardActions
            card={ac}
            onClose={() => setActiveCardId(null)}
            onUpdate={updated => {
              setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
              setActiveCardId(null);
            }}
            onMove={(id, novaEtapa) => {
              setCards(prev => prev.map(c => c.id === id ? { ...c, etapa: novaEtapa, status: 'pendente' } : c));
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── Entry point ───────────────────────────────────────────────
export default function Oficina({ notify, tvMode = false }) {
  const isTV = tvMode || window.location.hash === '#tv';
  if (isTV) return <OficinaTVMode />;
  return <OficinaDesktop notify={notify} />;
}
