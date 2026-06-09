import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'EasyBarber - Gestão para Barbearias';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#000000',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Orange glow top-left */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '-120px',
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            background: 'rgba(255, 122, 0, 0.18)',
            filter: 'blur(80px)',
          }}
        />

        {/* Emerald glow bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.14)',
            filter: 'blur(80px)',
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '48px 64px 0',
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'rgba(255,122,0,0.15)',
              border: '1.5px solid rgba(255,122,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
            }}
          >
            <div
              style={{
                fontSize: '26px',
              }}
            >
              ✂
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(255,122,0,0.75)',
              }}
            >
              Gestão para Barbearias
            </span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 900,
                color: '#ffffff',
                lineHeight: 1,
                marginTop: '3px',
              }}
            >
              EasyBarber
            </span>
          </div>
        </div>

        {/* Center content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '0 64px',
            gap: '80px',
          }}
        >
          {/* Left: headline */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h1
              style={{
                fontSize: '62px',
                fontWeight: 900,
                color: '#ffffff',
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Gerencie sua barbearia com{' '}
              <span style={{ color: '#FF7A00' }}>controle total.</span>
            </h1>
            <p
              style={{
                fontSize: '22px',
                color: 'rgba(255,255,255,0.55)',
                marginTop: '20px',
                lineHeight: 1.5,
              }}
            >
              Agenda, clientes, equipe e financeiro em uma plataforma única.
            </p>
          </div>

          {/* Right: stats card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minWidth: '260px',
            }}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Agendamentos</span>
              <span style={{ fontSize: '36px', fontWeight: 900, color: '#ffffff', lineHeight: 1.1, marginTop: '6px' }}>+37%</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Ocupação mensal</span>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>No-show</span>
              <span style={{ fontSize: '36px', fontWeight: 900, color: '#10b981', lineHeight: 1.1, marginTop: '6px' }}>-24%</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Com lembretes automáticos</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 64px 44px',
          }}
        >
          <div style={{ display: 'flex', gap: '24px' }}>
            {['14 dias grátis', 'Sem cartão no cadastro', 'Setup rápido'].map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '100px',
                  padding: '5px 14px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          <span
            style={{
              fontSize: '14px',
              color: 'rgba(255,122,0,0.6)',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            easybarber.com.br
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
