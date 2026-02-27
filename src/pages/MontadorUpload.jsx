import { useState, useEffect, useRef } from 'react';
import { Camera, Upload, CheckCircle2, AlertCircle, Image as ImageIcon, Clock, MapPin } from 'lucide-react';

const API = import.meta.env.VITE_API || '';

export default function MontadorUpload({ token }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [fotos, setFotos] = useState(0);
    const [ambiente, setAmbiente] = useState(null); // null até info carregar, depois inicializa com projeto_nome
    const [uploadedFotos, setUploadedFotos] = useState([]);
    const fileRef = useRef();
    const cameraRef = useRef();

    useEffect(() => {
        fetch(`${API}/api/montador/public/${token}`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => {
                setInfo(d);
                setAmbiente(d.projeto_nome || 'Geral');
            })
            .catch(() => setError('Link inválido ou expirado'))
            .finally(() => setLoading(false));
    }, [token]);

    // Comprimir imagem no client via Canvas (max 1920px, JPEG 80%)
    const compressImage = (file) => new Promise((resolve, reject) => {
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
                const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        setSuccess(false);

        try {
            // Comprimir antes de enviar
            const compressedData = await compressImage(file);
            // Trocar extensão para .jpg pois agora é sempre JPEG
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const fileName = `${baseName}.jpg`;

            const res = await fetch(`${API}/api/montador/public/${token}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: fileName, data: compressedData, ambiente }),
            });
            if (!res.ok) throw new Error();
            setFotos(f => f + 1);
            setUploadedFotos(prev => [...prev, {
                filename: fileName,
                ambiente,
                timestamp: new Date().toLocaleString('pt-BR'),
            }]);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
            setUploading(false);
        } catch {
            setError('Erro ao enviar foto');
            setUploading(false);
        }
    };

    const styles = mkStyles(info?.cor_primaria, info?.cor_accent);

    if (loading) return (
        <div style={styles.center}>
            <div style={styles.spinner} />
            <p style={{ color: '#666', marginTop: 16 }}>Carregando...</p>
        </div>
    );

    if (error && !info) return (
        <div style={styles.center}>
            <AlertCircle size={48} color="#ef4444" />
            <h2 style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#333' }}>Link Indisponível</h2>
            <p style={{ color: '#666', marginTop: 8, textAlign: 'center', maxWidth: 300 }}>{error}</p>
        </div>
    );

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    {info.empresa_logo ? (
                        <img src={info.empresa_logo} alt="" style={{ height: 44, objectFit: 'contain', maxWidth: 150 }} />
                    ) : (
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{info.empresa_nome}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#94a3b8', borderLeft: info.empresa_logo ? '1px solid #e2e8f0' : 'none', paddingLeft: info.empresa_logo ? 12 : 0 }}>
                        Registro Fotográfico
                    </div>
                </div>
                {fotos > 0 && (
                    <div style={styles.fotoBadge}>
                        <Camera size={14} />
                        {fotos}
                    </div>
                )}
            </div>

            {/* Info */}
            <div style={styles.infoCard}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                    Projeto: {info.projeto_nome}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    Montador: {info.nome_montador}
                </div>
                {fotos > 0 && (
                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginTop: 8 }}>
                        {fotos} foto(s) enviada(s) nesta sessão
                    </div>
                )}
            </div>

            {/* Upload Area */}
            <div style={styles.uploadArea}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: info?.cor_primaria || '#1B2A4A', marginBottom: 16, textAlign: 'center' }}>
                    Enviar Fotos
                </h3>

                {success && (
                    <div style={styles.successBanner}>
                        <CheckCircle2 size={18} /> Foto enviada com sucesso!
                    </div>
                )}

                {/* Ambiente Chips — scroll horizontal */}
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={14} />
                        Ambiente
                    </label>
                    <div style={{
                        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
                        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
                    }}>
                        {[info.projeto_nome || 'Geral', ...(info.ambientes || [])].map(amb => {
                            const selected = ambiente === amb;
                            return (
                                <button
                                    key={amb}
                                    onClick={() => setAmbiente(amb)}
                                    style={{
                                        padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                                        fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                                        transition: 'all 0.15s',
                                        background: selected ? (info?.cor_primaria || '#1B2A4A') : '#f1f5f9',
                                        color: selected ? '#fff' : '#475569',
                                        boxShadow: selected ? `0 2px 8px ${info?.cor_primaria || '#1B2A4A'}40` : 'none',
                                    }}
                                >
                                    {amb}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {uploading ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={styles.spinner} />
                        <p style={{ color: '#666', marginTop: 12 }}>Enviando...</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Botão da Câmera */}
                        <button
                            onClick={() => cameraRef.current?.click()}
                            style={styles.btnCamera}
                        >
                            <Camera size={22} /> Tirar Foto
                        </button>

                        {/* Botão de Galeria */}
                        <button
                            onClick={() => fileRef.current?.click()}
                            style={styles.btnGaleria}
                        >
                            <ImageIcon size={20} /> Enviar da Galeria
                        </button>

                        {/* Inputs invisíveis */}
                        <input
                            ref={cameraRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={e => handleUpload(e.target.files[0])}
                        />
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            multiple={false}
                            style={{ display: 'none' }}
                            onChange={e => handleUpload(e.target.files[0])}
                        />
                    </div>
                )}
            </div>

            {/* Fotos enviadas nesta sessão */}
            {uploadedFotos.length > 0 && (
                <div style={styles.sessionSection}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: info?.cor_primaria || '#1B2A4A', marginBottom: 12 }}>
                        Fotos enviadas nesta sessão ({uploadedFotos.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {uploadedFotos.map((foto, i) => (
                            <div key={i} style={styles.fotoItem}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                    <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {foto.filename}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    {foto.ambiente && (
                                        <span style={styles.ambienteTag}>{foto.ambiente}</span>
                                    )}
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                        <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                                        {foto.timestamp}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Info texto */}
            <div style={{ textAlign: 'center', padding: '20px 24px', color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
                As fotos são enviadas diretamente para a empresa.<br />
                Não é possível visualizar fotos já enviadas.
            </div>
        </div>
    );
}

const mkStyles = (cor1 = '#1B2A4A', cor2 = '#C9A96E') => ({
    center: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 24, background: '#f8fafc',
    },
    page: {
        minHeight: '100vh', background: '#f1f5f9',
        maxWidth: 480, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px',
        background: '#fff',
        borderBottom: `3px solid ${cor1}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    fotoBadge: {
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 20,
        background: `${cor1}12`, color: cor1,
        fontSize: 13, fontWeight: 700,
        border: `1px solid ${cor1}30`,
    },
    infoCard: {
        margin: '16px 16px 0', padding: 16, borderRadius: 14,
        background: '#fff', border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    uploadArea: {
        margin: 16, padding: 24, borderRadius: 16,
        background: '#fff', border: '2px dashed #cbd5e1',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
    },
    successBanner: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '10px 16px', borderRadius: 10, marginBottom: 16,
        background: '#f0fdf4', color: '#22c55e', fontWeight: 600, fontSize: 14,
        border: '1px solid #bbf7d0',
    },
    btnCamera: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '16px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: cor1, color: '#fff',
        fontSize: 16, fontWeight: 700,
        boxShadow: `0 4px 14px ${cor1}40`, transition: 'all 0.2s',
    },
    btnGaleria: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '14px 24px', borderRadius: 12, cursor: 'pointer',
        background: '#fff', color: '#334155', fontSize: 15, fontWeight: 600,
        border: '2px solid #e2e8f0', transition: 'all 0.2s',
    },
    sessionSection: {
        margin: '0 16px 16px', padding: 16, borderRadius: 14,
        background: '#fff', border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    fotoItem: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        background: '#f8fafc', border: '1px solid #f1f5f9',
    },
    ambienteTag: {
        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
        background: `${cor1}10`, color: cor1, fontSize: 11, fontWeight: 600,
        border: `1px solid ${cor1}25`,
    },
    spinner: {
        width: 32, height: 32, border: '3px solid #e2e8f0',
        borderTop: `3px solid ${cor1}`, borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto',
    },
});
