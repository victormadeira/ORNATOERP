import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Camera, CheckCircle2, AlertCircle, Image as ImageIcon, MapPin, X,
    RefreshCw, Wifi, WifiOff, Upload, Loader2, ChevronDown,
} from 'lucide-react';
import exifr from 'exifr';

const API = import.meta.env.VITE_API || '';
const CONCURRENT_UPLOADS = 3;
const MAX_RETRY = 3;
const RETRY_DELAY_BASE = 1500;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const compressToBlob = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
        img.onload = () => {
            const MAX_SIZE = 1920;
            let { width, height } = img;
            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round(height * (MAX_SIZE / width));
                    width = MAX_SIZE;
                } else {
                    width = Math.round(width * (MAX_SIZE / height));
                    height = MAX_SIZE;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Blob fail')), 'image/jpeg', 0.82);
        };
        img.onerror = reject;
        img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// EXIF silent — captura data + GPS sem pedir permissão
const parseExifSilent = async (file) => {
    try {
        const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude']);
        if (!data) return {};
        const out = {};
        const dt = data.DateTimeOriginal || data.CreateDate;
        if (dt) out.foto_tirada_em = new Date(dt).toISOString();
        if (data.latitude !== undefined && data.longitude !== undefined) {
            out.lat = data.latitude;
            out.lon = data.longitude;
        }
        return out;
    } catch { return {}; }
};

const uploadOnce = (blob, token, fields, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('arquivo', blob, fields.filename || 'foto.jpg');
    fd.append('ambiente', fields.ambiente || '');
    if (fields.foto_tirada_em) fd.append('foto_tirada_em', fields.foto_tirada_em);
    if (fields.lat != null) fd.append('lat', String(fields.lat));
    if (fields.lon != null) fd.append('lon', String(fields.lon));
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
        } else {
            try {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.error || `HTTP ${xhr.status}`));
            } catch { reject(new Error(`HTTP ${xhr.status}`)); }
        }
    });
    xhr.addEventListener('error', () => reject(new Error('Falha de rede')));
    xhr.addEventListener('abort', () => reject(new Error('Cancelado')));
    xhr.open('POST', `${API}/api/montador/public/${token}/upload`);
    xhr.send(fd);
});

// ─── Componente ───────────────────────────────────────────────────────────────
export default function MontadorUpload({ token }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ambientePadrao, setAmbientePadrao] = useState(null);
    const [queue, setQueue] = useState([]); // [{ id, file, blob, preview, ambiente, status, progress, error, attempt, serverId, exif }]
    const [online, setOnline] = useState(navigator.onLine);
    const [showAmbDropdownFor, setShowAmbDropdownFor] = useState(null);
    const cameraRef = useRef();
    const galRef = useRef();
    const queueRef = useRef(queue);
    queueRef.current = queue;

    // Carrega fonts da marca
    useEffect(() => {
        const id = 'montador-fonts';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Oswald:wght@400;500;600&display=swap';
            document.head.appendChild(link);
        }
    }, []);

    // Info do link
    useEffect(() => {
        fetch(`${API}/api/montador/public/${token}`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => {
                setInfo(d);
                setAmbientePadrao(d.projeto_nome || 'Geral');
            })
            .catch(() => setError('Link inválido ou expirado'))
            .finally(() => setLoading(false));
    }, [token]);

    // Online/offline detection
    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Cleanup blob URLs
    useEffect(() => () => {
        queueRef.current.forEach(q => q.preview && URL.revokeObjectURL(q.preview));
    }, []);

    // Adiciona arquivo(s) à queue (compressão + EXIF acontecem ao subir)
    const addFiles = useCallback(async (files) => {
        const arr = Array.from(files || []).filter(f => f && f.type.startsWith('image/'));
        if (arr.length === 0) return;
        const novos = arr.map(file => ({
            id: uid(),
            file,
            blob: null,
            preview: URL.createObjectURL(file),
            ambiente: ambientePadrao || '',
            status: 'preparing',
            progress: 0,
            error: null,
            attempt: 0,
            serverId: null,
            exif: {},
        }));
        setQueue(prev => [...prev, ...novos]);

        // Processa em paralelo (compressão + EXIF)
        novos.forEach(async (item) => {
            try {
                const [blob, exif] = await Promise.all([
                    compressToBlob(item.file),
                    parseExifSilent(item.file),
                ]);
                setQueue(prev => prev.map(q => q.id === item.id ? { ...q, blob, exif, status: 'pending' } : q));
            } catch (err) {
                setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: 'Erro ao preparar foto' } : q));
            }
        });
    }, [ambientePadrao]);

    // Inicia upload de um item específico
    const startUpload = useCallback(async (itemId) => {
        const item = queueRef.current.find(q => q.id === itemId);
        if (!item || !item.blob) return;
        setQueue(prev => prev.map(q => q.id === itemId ? { ...q, status: 'uploading', progress: 0, error: null } : q));
        try {
            const result = await uploadOnce(
                item.blob,
                token,
                {
                    ambiente: item.ambiente,
                    filename: item.file.name.replace(/\.[^.]+$/, '') + '.jpg',
                    foto_tirada_em: item.exif.foto_tirada_em,
                    lat: item.exif.lat,
                    lon: item.exif.lon,
                },
                (p) => setQueue(prev => prev.map(q => q.id === itemId ? { ...q, progress: p } : q))
            );
            setQueue(prev => prev.map(q => q.id === itemId ? { ...q, status: 'done', progress: 100, serverId: result.id } : q));
        } catch (err) {
            const cur = queueRef.current.find(q => q.id === itemId);
            const attempt = (cur?.attempt || 0) + 1;
            if (attempt >= MAX_RETRY || !navigator.onLine) {
                setQueue(prev => prev.map(q => q.id === itemId ? { ...q, status: 'error', error: err.message, attempt } : q));
            } else {
                const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
                setQueue(prev => prev.map(q => q.id === itemId ? { ...q, status: 'retry-wait', attempt, error: err.message } : q));
                setTimeout(() => {
                    setQueue(prev => prev.map(q => q.id === itemId && q.status === 'retry-wait' ? { ...q, status: 'pending' } : q));
                }, delay);
            }
        }
    }, [token]);

    // Worker: dispara uploads em paralelo (até CONCURRENT_UPLOADS)
    useEffect(() => {
        if (!online) return;
        const pending = queue.filter(q => q.status === 'pending');
        const active = queue.filter(q => q.status === 'uploading').length;
        const slots = Math.max(0, CONCURRENT_UPLOADS - active);
        pending.slice(0, slots).forEach(item => startUpload(item.id));
    }, [queue, online, startUpload]);

    // Retry manual (força um item específico)
    const retryItem = (itemId) => {
        setQueue(prev => prev.map(q => q.id === itemId ? { ...q, status: 'pending', attempt: 0, error: null } : q));
    };
    const retryAllErrors = () => {
        setQueue(prev => prev.map(q => q.status === 'error' ? { ...q, status: 'pending', attempt: 0, error: null } : q));
    };
    const removeItem = (itemId) => {
        setQueue(prev => {
            const item = prev.find(q => q.id === itemId);
            if (item?.preview) URL.revokeObjectURL(item.preview);
            return prev.filter(q => q.id !== itemId);
        });
    };

    // Muda ambiente de uma foto. Se já enviada, atualiza no server silently.
    const setItemAmbiente = async (itemId, newAmb) => {
        const item = queueRef.current.find(q => q.id === itemId);
        if (!item) return;
        setQueue(prev => prev.map(q => q.id === itemId ? { ...q, ambiente: newAmb } : q));
        setShowAmbDropdownFor(null);
        if (item.serverId) {
            try {
                await fetch(`${API}/api/montador/public/${token}/foto/${item.serverId}/ambiente`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ambiente: newAmb }),
                });
            } catch { /* silencioso */ }
        }
    };

    const ambientes = useMemo(() => {
        const set = new Set();
        if (info?.projeto_nome) set.add(info.projeto_nome);
        (info?.ambientes || []).forEach(a => set.add(a));
        set.add('Produção');
        set.add('Geral');
        return [...set];
    }, [info]);

    const stats = useMemo(() => ({
        total: queue.length,
        done: queue.filter(q => q.status === 'done').length,
        uploading: queue.filter(q => q.status === 'uploading' || q.status === 'preparing').length,
        pending: queue.filter(q => q.status === 'pending' || q.status === 'retry-wait').length,
        error: queue.filter(q => q.status === 'error').length,
    }), [queue]);

    const cor1 = info?.cor_primaria || '#B7654A';
    const cor2 = info?.cor_accent || '#1A1614';

    if (loading) return (
        <div style={mkStyles(cor1, cor2).center}>
            <Loader2 size={28} style={{ color: cor1, animation: 'spin 0.9s linear infinite' }} />
            <p style={{ color: '#5C544E', marginTop: 14, fontFamily: 'Geist, sans-serif' }}>Carregando…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error && !info) return (
        <div style={mkStyles(cor1, cor2).center}>
            <AlertCircle size={42} color="#C53030" />
            <h2 style={{ marginTop: 14, fontSize: 18, fontWeight: 600, color: '#1A1614', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.02em' }}>LINK INDISPONÍVEL</h2>
            <p style={{ color: '#5C544E', marginTop: 8, textAlign: 'center', maxWidth: 300, fontFamily: 'Geist, sans-serif' }}>{error}</p>
        </div>
    );

    const styles = mkStyles(cor1, cor2);

    return (
        <div style={styles.page}>
            {/* Header */}
            <header style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    {info.empresa_logo ? (
                        <img src={info.empresa_logo} alt="" style={{ height: 40, objectFit: 'contain', maxWidth: 130 }} />
                    ) : (
                        <span style={styles.logoText}>{(info.empresa_nome || 'Ornato').toUpperCase()}</span>
                    )}
                </div>
                <ConnectionIndicator online={online} />
            </header>

            {/* Info */}
            <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Projeto</div>
                <div style={styles.infoValue}>{info.projeto_nome}</div>
                <div style={{ ...styles.infoLabel, marginTop: 10 }}>Montador</div>
                <div style={{ ...styles.infoValue, fontWeight: 500 }}>{info.nome_montador || '—'}</div>
            </div>

            {/* Stats */}
            {stats.total > 0 && (
                <div style={styles.statsRow}>
                    <Stat label="Enviadas" value={stats.done} highlight={cor1} />
                    {stats.uploading > 0 && <Stat label="Enviando" value={stats.uploading} muted />}
                    {stats.pending > 0 && <Stat label="Fila" value={stats.pending} muted />}
                    {stats.error > 0 && <Stat label="Falhas" value={stats.error} highlight="#C53030" />}
                </div>
            )}

            {/* Ambiente padrão */}
            <div style={styles.ambSection}>
                <label style={styles.ambLabel}>
                    <MapPin size={13} /> Ambiente para próximas fotos
                </label>
                <div style={styles.ambChips}>
                    {ambientes.map(amb => {
                        const sel = ambientePadrao === amb;
                        return (
                            <button
                                key={amb}
                                onClick={() => setAmbientePadrao(amb)}
                                style={{
                                    ...styles.chip,
                                    background: sel ? cor1 : '#fff',
                                    color: sel ? '#fff' : '#1A1614',
                                    borderColor: sel ? cor1 : '#E5DED5',
                                }}
                            >
                                {amb}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Botões captura */}
            <div style={styles.captureRow}>
                <button onClick={() => cameraRef.current?.click()} style={{ ...styles.btnPrimary, background: cor1 }}>
                    <Camera size={22} strokeWidth={2} /> Tirar Foto
                </button>
                <button onClick={() => galRef.current?.click()} style={styles.btnSecondary}>
                    <ImageIcon size={20} strokeWidth={2} /> Galeria
                </button>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                       onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                <input ref={galRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                       onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {/* Erros — botão Tentar tudo */}
            {stats.error > 0 && (
                <div style={styles.errorBanner}>
                    <AlertCircle size={16} />
                    <span style={{ flex: 1 }}>
                        {stats.error} foto{stats.error > 1 ? 's' : ''} {stats.error > 1 ? 'falharam' : 'falhou'} ao enviar
                    </span>
                    <button onClick={retryAllErrors} style={styles.btnRetry}>
                        <RefreshCw size={13} /> Tentar tudo
                    </button>
                </div>
            )}

            {/* Offline banner */}
            {!online && queue.some(q => q.status === 'pending' || q.status === 'retry-wait') && (
                <div style={styles.offlineBanner}>
                    <WifiOff size={16} />
                    Sem internet — vou mandar quando o sinal voltar
                </div>
            )}

            {/* Grid de fotos */}
            {queue.length > 0 && (
                <div style={styles.grid}>
                    {queue.map(item => (
                        <FotoCard
                            key={item.id}
                            item={item}
                            cor1={cor1}
                            ambientes={ambientes}
                            showAmbDropdown={showAmbDropdownFor === item.id}
                            onToggleAmb={() => setShowAmbDropdownFor(showAmbDropdownFor === item.id ? null : item.id)}
                            onSetAmb={(amb) => setItemAmbiente(item.id, amb)}
                            onRetry={() => retryItem(item.id)}
                            onRemove={() => removeItem(item.id)}
                        />
                    ))}
                </div>
            )}

            {queue.length === 0 && (
                <div style={styles.emptyState}>
                    <Upload size={32} style={{ color: '#847974', marginBottom: 12 }} />
                    <p style={styles.emptyTitle}>Pronto pra começar</p>
                    <p style={styles.emptySub}>Tire fotos com a câmera ou envie da galeria. Você pode selecionar várias de uma vez.</p>
                </div>
            )}

            <div style={styles.footer}>
                As fotos vão direto pra equipe. Você pode ajustar o ambiente de cada uma tocando nelas.
                <br />
                <span style={{ opacity: 0.75, fontSize: 10.5 }}>
                    Quando disponíveis nos metadados, a data e localização da foto também são enviadas pra ajudar a equipe a confirmar o registro no local.
                </span>
            </div>
        </div>
    );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────
function Stat({ label, value, highlight, muted }) {
    return (
        <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #E5DED5', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 22, fontWeight: 500, color: highlight || '#1A1614', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9.5, color: '#847974', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4, fontWeight: 600 }}>{label}</div>
        </div>
    );
}

function ConnectionIndicator({ online }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999,
            background: online ? '#F0FDF4' : '#FEF2F2',
            color: online ? '#16A34A' : '#C53030',
            fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 600,
            border: `1px solid ${online ? '#BBF7D0' : '#FECACA'}`,
        }}>
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            {online ? 'Online' : 'Offline'}
        </div>
    );
}

function FotoCard({ item, cor1, ambientes, showAmbDropdown, onToggleAmb, onSetAmb, onRetry, onRemove }) {
    const isDone = item.status === 'done';
    const isUploading = item.status === 'uploading';
    const isPreparing = item.status === 'preparing';
    const isError = item.status === 'error';
    const isWaiting = item.status === 'pending' || item.status === 'retry-wait';

    return (
        <div style={{
            position: 'relative', borderRadius: 12, overflow: 'hidden',
            background: '#fff', border: '1px solid #E5DED5',
            opacity: isError ? 0.85 : 1,
        }}>
            <div style={{ position: 'relative', aspectRatio: '1', background: '#F5F1EA' }}>
                {item.preview && <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}

                {/* Overlay status */}
                {!isDone && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(26,22,20,0.32)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(2px)',
                    }}>
                        {isPreparing && <Loader2 size={22} style={{ color: '#fff', animation: 'spin 0.9s linear infinite' }} />}
                        {isUploading && (
                            <div style={{ textAlign: 'center', color: '#fff' }}>
                                <Loader2 size={22} style={{ animation: 'spin 0.9s linear infinite', marginBottom: 6 }} />
                                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 600 }}>{item.progress}%</div>
                            </div>
                        )}
                        {isError && (
                            <button onClick={onRetry} style={{
                                background: '#fff', border: 'none', borderRadius: 999, padding: '8px 14px',
                                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                fontFamily: 'Geist, sans-serif', fontSize: 12, fontWeight: 600, color: '#C53030',
                            }}>
                                <RefreshCw size={13} /> Tentar
                            </button>
                        )}
                        {isWaiting && <Loader2 size={20} style={{ color: '#fff', opacity: 0.7 }} />}
                    </div>
                )}

                {/* Done check */}
                {isDone && (
                    <div style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 24, height: 24, borderRadius: '50%',
                        background: cor1, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}>
                        <CheckCircle2 size={14} strokeWidth={2.5} />
                    </div>
                )}

                {/* Remove (só pré-upload) */}
                {(isPreparing || isWaiting || isError) && (
                    <button onClick={onRemove} style={{
                        position: 'absolute', top: 6, left: 6,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(26,22,20,0.6)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <X size={12} strokeWidth={2.5} />
                    </button>
                )}

                {/* Progress bar (uploading) */}
                {isUploading && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.3)' }}>
                        <div style={{ height: '100%', width: `${item.progress}%`, background: cor1, transition: 'width 0.3s' }} />
                    </div>
                )}
            </div>

            {/* Ambiente dropdown */}
            <div style={{ position: 'relative' }}>
                <button onClick={onToggleAmb} style={{
                    width: '100%', padding: '8px 10px', border: 'none', background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    cursor: 'pointer', borderTop: '1px solid #F2EDE5',
                    fontFamily: 'Geist, sans-serif', fontSize: 11.5, color: '#1A1614', fontWeight: 500,
                }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                        {item.ambiente || 'Sem ambiente'}
                    </span>
                    <ChevronDown size={12} style={{ color: '#847974', flexShrink: 0 }} />
                </button>
                {showAmbDropdown && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                        background: '#fff', border: '1px solid #E5DED5', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(26,22,20,0.12)',
                        maxHeight: 180, overflowY: 'auto', marginTop: 2,
                    }}>
                        {ambientes.map(a => (
                            <button key={a} onClick={() => onSetAmb(a)} style={{
                                width: '100%', padding: '8px 12px', border: 'none', background: 'transparent',
                                textAlign: 'left', fontFamily: 'Geist, sans-serif', fontSize: 12,
                                color: a === item.ambiente ? cor1 : '#1A1614', fontWeight: a === item.ambiente ? 600 : 400,
                                cursor: 'pointer',
                            }}>{a}</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const mkStyles = (cor1, cor2) => ({
    page: {
        minHeight: '100vh', background: '#FAF7F2',
        maxWidth: 540, margin: '0 auto',
        fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
        color: '#1A1614', paddingBottom: 40,
    },
    center: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 24, background: '#FAF7F2',
        fontFamily: 'Geist, sans-serif',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '18px 20px', background: '#fff',
        borderBottom: '1px solid #E5DED5',
    },
    logoText: {
        fontFamily: 'Oswald, sans-serif', fontSize: 20, fontWeight: 500,
        letterSpacing: '0.05em', color: '#1A1614',
    },
    infoCard: {
        margin: '14px 16px 0', padding: '14px 18px',
        background: '#fff', border: '1px solid #E5DED5', borderRadius: 14,
    },
    infoLabel: {
        fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: '#847974',
        marginBottom: 3,
    },
    infoValue: {
        fontFamily: 'Geist, sans-serif', fontSize: 14, fontWeight: 500, color: '#1A1614',
        letterSpacing: '-0.01em',
    },
    statsRow: {
        display: 'flex', gap: 8, margin: '12px 16px 0',
    },
    ambSection: {
        margin: '16px 16px 0',
    },
    ambLabel: {
        display: 'flex', alignItems: 'center', gap: 5,
        fontFamily: 'Geist Mono, monospace', fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: '#847974',
        marginBottom: 8,
    },
    ambChips: {
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6,
        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
    },
    chip: {
        padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
        fontFamily: 'Geist, sans-serif', fontSize: 13, fontWeight: 500,
        whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.18s',
        border: '1px solid #E5DED5', letterSpacing: '-0.01em',
    },
    captureRow: {
        display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10,
        margin: '16px 16px 0',
    },
    btnPrimary: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '14px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
        color: '#fff', fontFamily: 'Geist, sans-serif', fontSize: 15, fontWeight: 600,
        letterSpacing: '-0.01em', transition: 'transform 0.15s',
        boxShadow: `0 4px 12px ${cor1}30`,
    },
    btnSecondary: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
        background: '#fff', color: '#1A1614', border: '1px solid #E5DED5',
        fontFamily: 'Geist, sans-serif', fontSize: 13.5, fontWeight: 500,
        letterSpacing: '-0.01em',
    },
    errorBanner: {
        margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10,
        background: '#FEF2F2', color: '#C53030', border: '1px solid #FECACA',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        fontFamily: 'Geist, sans-serif', fontWeight: 500,
    },
    btnRetry: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 10px', borderRadius: 6, border: '1px solid #C53030',
        background: '#fff', color: '#C53030', cursor: 'pointer',
        fontFamily: 'Geist, sans-serif', fontSize: 12, fontWeight: 600,
    },
    offlineBanner: {
        margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10,
        background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        fontFamily: 'Geist, sans-serif', fontWeight: 500,
    },
    grid: {
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
        margin: '16px 16px 0',
    },
    emptyState: {
        margin: '32px 16px 0', padding: '40px 24px', textAlign: 'center',
        background: '#fff', border: '1px dashed #E5DED5', borderRadius: 14,
    },
    emptyTitle: {
        fontFamily: 'Oswald, sans-serif', fontSize: 17, fontWeight: 500, color: '#1A1614',
        letterSpacing: '-0.01em', margin: '0 0 4px',
    },
    emptySub: {
        fontFamily: 'Geist, sans-serif', fontSize: 13, color: '#5C544E',
        lineHeight: 1.5, margin: 0, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto',
    },
    footer: {
        margin: '24px 16px 0', padding: '16px 24px', textAlign: 'center',
        fontFamily: 'Geist, sans-serif', fontSize: 11.5, color: '#847974',
        lineHeight: 1.5,
    },
});
