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
  Calendar, FolderOpen, Tag, RefreshCw, Maximize2, Filter,
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

      {/* Chips: prazo, responsável */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: pct !== null ? 8 : 0 }}>
        {pz && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: pz.bg, color: pz.color, fontVariantNumeric: 'tabular-nums' }}>
            <Calendar size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />{dtFmt(card.prazo)}
          </span>
        )}
        {card.responsavel && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#F1F5F9', color: '#475569' }}>
            <User size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />{card.responsavel}
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
function CardModal({ cardId, cards, onClose, onUpdate, onDelete, notify }) {
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Responsável</div>
                <input value={form.responsavel || ''} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} style={inputStyle} placeholder="Nome do marceneiro" />
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
              {data.responsavel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', background: '#F1F5F9', padding: '5px 10px', borderRadius: 99 }}>
                  <User size={12} /><span>{data.responsavel}</span>
                </div>
              )}
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

// ─── Modal: novo card ──────────────────────────────────────────
function NewCardModal({ initialEtapa, onClose, onCreate, notify }) {
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
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Responsável</label>
              <input value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Marceneiro…" style={inp} />
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

// ─── Desktop principal ─────────────────────────────────────────
function OficinaDesktop({ notify }) {
  const [cards, setCards]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [openId, setOpenId]       = useState(null);
  const [newCardEtapa, setNewCardEtapa] = useState(null);
  const [filterProj, setFilterProj] = useState('');
  const [filterResp, setFilterResp] = useState('');
  const [activeId, setActiveId]   = useState(null);

  const load = () => {
    setLoading(true);
    japi('').then(d => { if (Array.isArray(d)) setCards(d); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

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
  const resps    = useMemo(() => [...new Set(cards.map(c => c.responsavel).filter(Boolean))], [cards]);

  const filtered = cards.filter(c =>
    (!filterProj || c.projeto_nome === filterProj) &&
    (!filterResp || c.responsavel  === filterResp)
  );

  const byEtapa  = (etapaId) => filtered.filter(c => c.etapa === etapaId);
  const activeCard = cards.find(c => c.id === activeId);

  const openTV = () => {
    const w = window.open(`${window.location.origin}${window.location.pathname}#tv`, '_blank', 'noopener');
    if (!w) window.open(`${window.location.origin}${window.location.pathname}#tv`);
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
          {(projetos.length > 0 || resps.length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={13} style={{ color: '#94a3b8' }} aria-hidden="true" />
              {projetos.length > 0 && (
                <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#FAFAFA', outline: 'none', color: '#334155' }}>
                  <option value="">Todos os projetos</option>
                  {projetos.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {resps.length > 0 && (
                <select value={filterResp} onChange={e => setFilterResp(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#FAFAFA', outline: 'none', color: '#334155' }}>
                  <option value="">Todos os marceneiros</option>
                  {resps.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} title="Atualizar" style={{ padding: '8px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
              <RefreshCw size={14} />
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
        />
      )}
      {newCardEtapa && (
        <NewCardModal
          initialEtapa={newCardEtapa}
          onClose={() => setNewCardEtapa(null)}
          onCreate={card => setCards(prev => [...prev, card])}
          notify={notify}
        />
      )}
    </div>
  );
}

// ─── Modo TV — painel de chão de fábrica ───────────────────────
function TVCard({ card }) {
  const age = ageDot(card.atualizado_em || card.criado_em);
  const pz  = prazoClass(card.prazo);
  const e   = ETAPA_MAP[card.etapa];

  return (
    <div style={{
      background: '#141920',
      borderRadius: 10,
      borderLeft: `5px solid ${card.cor || '#C9A96E'}`,
      padding: '12px 14px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: age, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#F8FAFC', lineHeight: 1.25, marginBottom: 3 }}>{card.ambiente}</div>
          {card.projeto_nome && (
            <div style={{ fontSize: 11, color: card.cor || '#C9A96E', fontWeight: 600, marginBottom: pz || card.responsavel ? 5 : 0 }}>
              {card.projeto_nome}{card.cliente_nome ? ` · ${card.cliente_nome}` : ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {card.responsavel && (
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                <User size={9} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />{card.responsavel}
              </span>
            )}
            {pz && (
              <span style={{ fontSize: 10, fontWeight: 700, color: pz.color }}>{dtFmt(card.prazo)}</span>
            )}
          </div>
        </div>
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

// ─── Modo TV ───────────────────────────────────────────────────
function OficinaTVMode() {
  const [cards, setCards]           = useState([]);
  const [clock, setClock]           = useState('');
  const [lastRefresh, setLastRefresh] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const load = useCallback(() => {
    japi('').then(d => {
      if (Array.isArray(d)) setCards(d);
      setLastRefresh(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    });
  }, []);

  // Polling + relógio
  useEffect(() => {
    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [load]);

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
          <span style={{ fontSize: 17, fontWeight: 900, color: '#C9A96E', letterSpacing: '-0.02em' }}>Oficina</span>
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

        {/* Direita: legenda de idade + relógio + fullscreen */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[['#10B981','até 1d'],['#F59E0B','2–3d'],['#EF4444','4+d']].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#475569' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
            <span style={{ fontSize: 9, color: '#2a3040', marginLeft: 4 }}>↑ atualiz. card</span>
          </div>
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

      {/* ── Body: kanban + calendário ─────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Colunas kanban */}
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
                  {colCards.map(card => <TVCard key={card.id} card={card} />)}
                  {colCards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#2a3040', fontSize: 11 }}>Sem cards</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

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
    </div>
  );
}

// ─── Entry point ───────────────────────────────────────────────
export default function Oficina({ notify, tvMode = false }) {
  const isTV = tvMode || window.location.hash === '#tv';
  if (isTV) return <OficinaTVMode />;
  return <OficinaDesktop notify={notify} />;
}
