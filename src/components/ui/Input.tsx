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

const inputBase: React.CSSProperties = {
  width: '100%',
  background: '#EFEFEF',
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  fontFamily: 'Space Grotesk, sans-serif',
  color: '#0D0D0D',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  letterSpacing: '-0.01em',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#A0A0A0',
  fontFamily: 'JetBrains Mono, monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

export function Input({ label, error, helper, prefix, suffix, mono, className, style, ...props }: InputProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <div style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: '#A0A0A0', display: 'flex', alignItems: 'center', pointerEvents: 'none',
          }}>{prefix}</div>
        )}
        <input
          {...props}
          style={{
            ...inputBase,
            paddingLeft: prefix ? 40 : 14,
            paddingRight: suffix ? 40 : 14,
            fontFamily: mono ? 'JetBrains Mono, monospace' : 'Space Grotesk, sans-serif',
            borderColor: error ? 'rgba(239,68,68,0.5)' : undefined,
            ...style,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#0D0D0D'
            e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.05)'
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(0,0,0,0.10)'
            e.target.style.boxShadow = 'none'
            props.onBlur?.(e)
          }}
          className={className}
        />
        {suffix && (
          <div style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            color: '#A0A0A0', display: 'flex', alignItems: 'center',
          }}>{suffix}</div>
        )}
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 5, fontFamily: 'Space Grotesk, sans-serif' }}>{error}</p>}
      {helper && !error && <p style={{ fontSize: 12, color: '#A0A0A0', marginTop: 5, fontFamily: 'Space Grotesk, sans-serif' }}>{helper}</p>}
    </div>
  )
}

export function Textarea({ label, error, helper, className, style, ...props }: TextareaProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea
        {...props}
        rows={props.rows ?? 3}
        style={{
          ...inputBase,
          resize: 'vertical',
          minHeight: 80,
          borderColor: error ? 'rgba(239,68,68,0.5)' : undefined,
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#0D0D0D'
          e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.05)'
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(0,0,0,0.10)'
          e.target.style.boxShadow = 'none'
          props.onBlur?.(e)
        }}
        className={className}
      />
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 5, fontFamily: 'Space Grotesk, sans-serif' }}>{error}</p>}
      {helper && !error && <p style={{ fontSize: 12, color: '#A0A0A0', marginTop: 5, fontFamily: 'Space Grotesk, sans-serif' }}>{helper}</p>}
    </div>
  )
}
