import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth';
import './index.css';
import App from './App';
import { installGlobalErrorHandlers } from './lib/errorReporter';

// Instala listeners globais de erro ANTES de montar — pega erros de init também
installGlobalErrorHandlers();

// ── Páginas públicas lazy (cada rota puxa só seu próprio chunk) ──
// Antes eram import eager → inflavam o main chunk em ~2MB (three.js + pages)
const ProposalPublic        = lazy(() => import('./pages/ProposalPublic'));
const PortalCliente         = lazy(() => import('./pages/PortalCliente'));
const MontadorUpload        = lazy(() => import('./pages/MontadorUpload'));
const LandingPage           = lazy(() => import('./pages/LandingPage'));
const LandingPageV2         = lazy(() => import('./pages/LandingPageV2'));
const PropostaApresentacao  = lazy(() => import('./pages/PropostaApresentacao'));
const AssinaturaPublic      = lazy(() => import('./pages/AssinaturaPublic'));
const VerificacaoAssinatura = lazy(() => import('./pages/VerificacaoAssinatura'));
const ScanPeca3D            = lazy(() => import('./pages/ScanPeca3D'));
const ProducaoCNCTV         = lazy(() => import('./pages/ProducaoCNCTV'));
const ModoOperador          = lazy(() => import('./pages/ModoOperador'));

// Fallback leve — só um wrapper centralizado com spinner CSS
const PublicFallback = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg-app, #0b0e13)',
    }}>
        <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2.5px solid rgba(19,121,240,0.15)',
            borderTopColor: 'var(--primary, #1379F0)',
            animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

// Detectar acesso público via query params OU path
const params = new URLSearchParams(window.location.search);
const path = window.location.pathname;

// Suporta: /apresentacao/TOKEN
const apresentacaoToken = (path.match(/^\/apresentacao\/([a-f0-9]+)$/i) || [])[1] || null;

// Preview interno (sem tracking): /preview/proposta/TOKEN
const previewPropostaToken = (path.match(/^\/preview\/proposta\/([a-f0-9]+)$/i) || [])[1] || null;

// Preview interno (sem notificações): /preview/portal/TOKEN
const previewPortalToken = (path.match(/^\/preview\/portal\/([a-f0-9]+)$/i) || [])[1] || null;

// Suporta: ?proposta=TOKEN ou /proposta/TOKEN
const proposalToken = params.get('proposta')
    || (path.match(/^\/proposta\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Suporta: ?portal=TOKEN ou /portal/TOKEN
const portalToken = params.get('portal')
    || (path.match(/^\/portal\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Suporta: ?montador=TOKEN ou /montador/TOKEN
const montadorToken = params.get('montador')
    || (path.match(/^\/montador\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Assinatura eletrônica: /assinar/TOKEN
const assinaturaToken = (path.match(/^\/assinar\/([a-f0-9]+)$/i) || [])[1] || null;

// Verificação de assinatura: /verificar/CODIGO
const verificacaoCodigo = (path.match(/^\/verificar\/([A-Z0-9]+)$/i) || [])[1] || null;

// Scan peça 3D: /scan/CODIGO ou /scan
const scanCodigo = (path.match(/^\/scan\/(.+)$/i) || [])[1] || null;
const isScanPage = path === '/scan' || path === '/scan/';

// Preview peça pública: /p/ID
const pecaPublicId = (path.match(/^\/p\/(\d+)$/i) || [])[1] || null;

// Landing page pública: /contato, /landing ou /landingpage
const isLanding   = ['/contato', '/landing', '/landingpage', '/landingpage/'].includes(path);
// Landing V2 (nova versão com diferenciais + portfolio por categoria + depoimentos com foto)
const isLandingV2 = ['/lp2', '/lp2/'].includes(path);

// TV Corte CNC: /tv-corte
const isTVCorte = path === '/tv-corte' || path === '/tv-corte/';

// Modo Operador CNC: /operador-cnc
const isOperadorCNC = path === '/operador-cnc' || path === '/operador-cnc/';

// Renderiza com Suspense — rota pública carrega só o que usa.
// O App (área logada) é eager pra não atrapalhar o login.
function renderRoute() {
    if (isOperadorCNC)          return <ModoOperador onBack={() => window.history.back()} />;
    if (isTVCorte)              return <ProducaoCNCTV />;
    if (pecaPublicId)           return <ScanPeca3D codigo={pecaPublicId} />;
    if (scanCodigo || isScanPage) return <ScanPeca3D codigo={scanCodigo} />;
    if (isLanding)              return <LandingPage />;
    if (isLandingV2)            return <LandingPageV2 />;
    if (apresentacaoToken)      return <PropostaApresentacao token={apresentacaoToken} />;
    if (previewPropostaToken)   return <ProposalPublic token={previewPropostaToken} isPreview />;
    if (previewPortalToken)     return <PortalCliente token={previewPortalToken} isPreview />;
    if (proposalToken)          return <ProposalPublic token={proposalToken} />;
    if (portalToken)            return <PortalCliente token={portalToken} />;
    if (montadorToken)          return <MontadorUpload token={montadorToken} />;
    if (assinaturaToken)        return <AssinaturaPublic token={assinaturaToken} />;
    if (verificacaoCodigo)      return <VerificacaoAssinatura codigo={verificacaoCodigo} />;
    return null; // → cai no App logado
}

const publicRoute = renderRoute();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {publicRoute ? (
            <Suspense fallback={<PublicFallback />}>
                {publicRoute}
            </Suspense>
        ) : (
            <AuthProvider>
                <App />
            </AuthProvider>
        )}
    </React.StrictMode>
);
