import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#062727',
          borderRadius: 96,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative triangle shapes */}
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 60,
            width: 0,
            height: 0,
            borderLeft: '80px solid transparent',
            borderRight: '80px solid transparent',
            borderBottom: '280px solid rgba(118,189,211,0.3)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 50,
            top: 90,
            width: 0,
            height: 0,
            borderLeft: '70px solid transparent',
            borderRight: '70px solid transparent',
            borderBottom: '250px solid rgba(255,255,255,0.1)',
            display: 'flex',
          }}
        />
        {/* CRM text */}
        <div
          style={{
            fontSize: 160,
            fontWeight: 700,
            color: 'white',
            letterSpacing: 8,
            display: 'flex',
          }}
        >
          CRM
        </div>
        {/* Accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 110,
            left: 100,
            right: 100,
            height: 5,
            backgroundColor: '#76BDD3',
            borderRadius: 3,
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
