import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: 'white',
            letterSpacing: 3,
            display: 'flex',
          }}
        >
          CRM
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 32,
            right: 32,
            height: 2,
            backgroundColor: '#76BDD3',
            borderRadius: 1,
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
