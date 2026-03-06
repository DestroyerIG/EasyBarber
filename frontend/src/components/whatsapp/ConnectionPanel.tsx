'use client';

import {
  CheckCircle,
  QrCode,
  Loader2,
  WifiOff,
  Smartphone,
  RefreshCw,
  LogOut,
} from 'lucide-react';

interface WhatsAppStatus {
  status: 'disconnected' | 'qr' | 'connecting' | 'connected';
  qrCode: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  error: string | null;
}

interface ConnectionPanelProps {
  waStatus: WhatsAppStatus;
  statusLoading: boolean;
  actionLoading: boolean;
  onRestart: () => void;
}

export const ConnectionPanel = ({ waStatus, statusLoading, actionLoading, onRestart }: ConnectionPanelProps) => (
  <div className="card rounded-2xl overflow-hidden">
    <div className="p-8 border-b border-gray-800 bg-black/20">
      <h3 className="text-xl font-bold text-white mb-2">Conexão WhatsApp</h3>
      <p className="text-gray-400 text-sm">Conecte-se ao WhatsApp escaneando o QR Code abaixo com seu celular.</p>
    </div>
    <div className="p-8">
      {waStatus.status === 'qr' && waStatus.qrCode && (
        <div className="flex flex-col items-center space-y-6">
          <div className="relative p-6 bg-white rounded-2xl shadow-2xl shadow-primary/10 transition-all duration-500 scale-100 hover:scale-105">
            <img src={waStatus.qrCode} alt="QR Code WhatsApp" className="w-[280px] h-[280px]" style={{ imageRendering: 'pixelated' }} />
            <div className="absolute -top-3 -right-3 w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
              <QrCode size={20} className="text-black" />
            </div>
          </div>
          <div className="text-center space-y-2 max-w-sm">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <Smartphone size={18} />
              <p className="text-sm font-bold uppercase tracking-wider">Escaneie o QR Code</p>
            </div>
            <ol className="text-xs text-gray-400 space-y-1 text-left list-decimal list-inside">
              <li>Abra o <strong className="text-white">WhatsApp</strong> no celular</li>
              <li>Toque em <strong className="text-white">Aparelhos conectados</strong></li>
              <li>Toque em <strong className="text-white">Conectar um aparelho</strong></li>
              <li>Aponte a câmera para o QR Code acima</li>
            </ol>
          </div>
        </div>
      )}

      {waStatus.status === 'connected' && (
        <div className="flex flex-col items-center space-y-6 py-8">
          <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/30 animate-pulse">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <div className="text-center space-y-2">
            <h4 className="text-2xl font-bold text-white">WhatsApp Conectado!</h4>
            <p className="text-gray-400 text-sm">O bot está ativo e pronto para receber mensagens.</p>
            {waStatus.connectedNumber && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                <Smartphone size={16} className="text-green-500" />
                <span className="text-green-400 font-mono text-sm font-bold">+{waStatus.connectedNumber}</span>
                {waStatus.connectedName && (
                  <span className="text-gray-500 text-xs ml-1">({waStatus.connectedName})</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {waStatus.status === 'connecting' && (
        <div className="flex flex-col items-center space-y-6 py-8">
          <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center border-2 border-blue-500/30">
            <Loader2 size={48} className="text-blue-500 animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h4 className="text-xl font-bold text-white">Conectando...</h4>
            <p className="text-gray-400 text-sm">Carregando a sessão do WhatsApp. Aguarde um momento.</p>
          </div>
        </div>
      )}

      {waStatus.status === 'disconnected' && (
        <div className="flex flex-col items-center space-y-6 py-8">
          <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/30">
            <WifiOff size={48} className="text-red-500" />
          </div>
          <div className="text-center space-y-2">
            <h4 className="text-xl font-bold text-white">WhatsApp Desconectado</h4>
            <p className="text-gray-400 text-sm">Clique no botão abaixo para iniciar a conexão.</p>
            <button
              onClick={onRestart}
              disabled={actionLoading}
              className="mt-4 btn-primary flex items-center gap-2 mx-auto disabled:opacity-50"
            >
              {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              Conectar WhatsApp
            </button>
          </div>
        </div>
      )}

      {statusLoading && waStatus.status === 'disconnected' && (
        <div className="flex flex-col items-center space-y-6 py-8">
          <Loader2 size={48} className="text-gray-600 animate-spin" />
          <p className="text-gray-500 text-sm">Verificando status do WhatsApp...</p>
        </div>
      )}
    </div>
  </div>
);
