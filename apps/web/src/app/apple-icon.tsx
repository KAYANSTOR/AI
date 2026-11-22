import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#D8E2D0',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
          <g fill="none" stroke="#1F3B22" strokeWidth="78" strokeLinecap="round" strokeLinejoin="round">
            <path d="M151 385V127" />
            <path d="M178 256L321 122" />
            <path d="M178 256L348 397" />
          </g>
          <path fill="#F2D600" d="M384 66C396 105 407 116 446 128C407 140 396 151 384 190C372 151 361 140 322 128C361 116 372 105 384 66Z" />
        </svg>
      </div>
    ),
    size,
  )
}
