import React from 'react'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  error?: string
  helper?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  mono?: boolean
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helper?: string
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--nan-text2)', fontFamily: 'Inter, sans-serif',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
}

const getInputStyle = (error?: string, mono?: boolean): React.CSSProperties => ({
  width: '100%', background: 'var(--nan-surface2)',
  border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--nan-bdr)'}`,
  borderRadius: 10, padding: '12px 14px', fontSize: 14,
  fontFamily: mono ? 'monospace' : 'Inter, sans-serif',
  color: 'var(--nan-text)', outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  letterSpacing: '-0.01em', boxSizing: 'border-box',
})

export function Input({ label, error, helper, prefix, suffix, mono, className, style, ...props }: InputProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--nan-text2)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>{prefix}</div>
        )}
        <input
          {...props}
          className={className}
          style={{
            ...getInputStyle(error, mono),
            paddingLeft: prefix ? 40 : 14,
            paddingRight: suffix ? 40 : 14,
            ...style,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#0066FF'
            e.target.style.boxShadow = '0 0 0 3px rgba(0,102,255,0.12)'
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'var(--nan-bdr)'
            e.target.style.boxShadow = 'none'
            props.onBlur?.(e)
          }}
        />
        {suffix && (
          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--nan-text2)', display: 'flex', alignItems: 'center' }}>{suffix}</div>
        )}
      </div>
      {error  && <p style={{ marginTop: 6, fontSize: 12, color: '#EF4444', fontFamily: 'Inter, sans-serif' }}>{error}</p>}
      {helper && <p style={{ marginTop: 6, fontSize: 12, color: 'var(--nan-text2)', fontFamily: 'Inter, sans-serif' }}>{helper}</p>}
    </div>
  )
}

export function Textarea({ label, error, helper, style, ...props }: TextareaProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea
        {...props}
        style={{
          ...getInputStyle(error),
          resize: 'vertical', minHeight: 80, paddingTop: 12,
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#0066FF'
          e.target.style.boxShadow = '0 0 0 3px rgba(0,102,255,0.12)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'var(--nan-bdr)'
          e.target.style.boxShadow = 'none'
        }}
      />
      {error  && <p style={{ marginTop: 6, fontSize: 12, color: '#EF4444' }}>{error}</p>}
      {helper && <p style={{ marginTop: 6, fontSize: 12, color: 'var(--nan-text2)' }}>{helper}</p>}
    </div>
  )
}
