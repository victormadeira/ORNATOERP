import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth';
import './index.css';
import App from './App';
import ProposalPublic from './pages/ProposalPublic';
import PortalCliente from './pages/PortalCliente';
import MontadorUpload from './pages/MontadorUpload';
import LandingPage from './pages/LandingPage';
import PropostaApresentacao from './pages/PropostaApresentacao';
import AssinaturaPublic from './pages/AssinaturaPublic';
import VerificacaoAssinatura from './pages/VerificacaoAssinatura';
import ScanPeca3D from './pages/ScanPeca3D';
import ProducaoCNCTV from './pages/ProducaoCNCTV';

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
const isLanding = ['/contato', '/landing', '/landingpage', '/landingpage/'].includes(path);

// TV Corte CNC: /tv-corte
const isTVCorte = path === '/tv-corte' || path === '/tv-corte/';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {isTVCorte ? (
            <ProducaoCNCTV />
        ) : pecaPublicId ? (
            <ScanPeca3D codigo={pecaPublicId} />
        ) : (scanCodigo || isScanPage) ? (
            <ScanPeca3D codigo={scanCodigo} />
        ) : isLanding ? (
            <LandingPage />
        ) : apresentacaoToken ? (
            <PropostaApresentacao token={apresentacaoToken} />
        ) : previewPropostaToken ? (
            <ProposalPublic token={previewPropostaToken} isPreview />
        ) : previewPortalToken ? (
            <PortalCliente token={previewPortalToken} isPreview />
        ) : proposalToken ? (
            <ProposalPublic token={proposalToken} />
        ) : portalToken ? (
            <PortalCliente token={portalToken} />
        ) : montadorToken ? (
            <MontadorUpload token={montadorToken} />
        ) : assinaturaToken ? (
            <AssinaturaPublic token={assinaturaToken} />
        ) : verificacaoCodigo ? (
            <VerificacaoAssinatura codigo={verificacaoCodigo} />
        ) : (
            <AuthProvider>
                <App />
            </AuthProvider>
        )}
    </React.StrictMode>
);
