export function NanLogo({ height = 44 }) {
  return (
    <div style={{display:'inline-flex', alignItems:'center', gap:9}}>
      <div style={{width:height, height:height, borderRadius:'50%', background:'#4338CA', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width={height*0.43} height={height*0.61} style={{display:'block'}}>
          <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
          <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
        </svg>
      </div>
      <span style={{fontWeight:800, fontSize:height*0.45, color:'var(--text, #f0f0f0)', fontFamily:'Manrope, Inter, sans-serif', lineHeight:`${height}px`}}>NAN</span>
    </div>
  )
}
