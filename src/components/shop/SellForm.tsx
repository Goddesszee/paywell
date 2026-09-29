import React, { useState } from 'react'
import { ArrowLeft, Check, Camera, X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useShopStore, ConditionLabel, DeliveryMethod } from '../../store/shopStore'
import { useAppStore } from '../../store/appStore'
import { Button } from '../ui/Button'
import { SHOP_CATEGORIES } from '../../data/shopCategories'
import { formatUSDC } from '../../utils/format'
import { toast } from 'sonner'

const FONT = "'Inter', -apple-system, sans-serif"

const CONDITIONS: { id: ConditionLabel; label: string; desc: string }[] = [
  { id: 'new',       label: 'New',       desc: 'Never used, original packaging' },
  { id: 'like_new',  label: 'Like New',  desc: 'Used once or twice, no signs of wear' },
  { id: 'excellent', label: 'Excellent', desc: 'Minimal wear, fully functional' },
  { id: 'good',      label: 'Good',      desc: 'Normal wear, works perfectly' },
  { id: 'fair',      label: 'Fair',      desc: 'Visible wear, functional' },
]

const DELIVERY_OPTS: { id: DeliveryMethod; label: string }[] = [
  { id: 'standard', label: 'Standard delivery' },
  { id: 'express',  label: 'Express delivery' },
  { id: 'digital',  label: 'Digital / instant download' },
  { id: 'pickup',   label: 'Local pickup' },
]

interface SellFormProps {
  onBack: () => void
}

type Step = 'details' | 'condition' | 'pricing' | 'kyc' | 'preview'

export function SellForm({ onBack }: SellFormProps) {
  const { address } = useAccount()
  const { submitListing } = useAppStore()
  useShopStore()

  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('electronics')
  const [description, setDescription] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [condition, setCondition] = useState<ConditionLabel>('new')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [location, setLocation] = useState('')
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryMethod[]>(['standard'])
  const [kycFullName, setKycFullName] = useState('')
  const [kycIdType, setKycIdType] = useState('passport')
  const [kycIdNumber, setKycIdNumber] = useState('')
  const [wallet, setWallet] = useState(address ?? '')
  const [submitted, setSubmitted] = useState(false)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImageBase64(ev.target?.result as string)
      setImageUrl('')
    }
    reader.readAsDataURL(file)
  }

  const toggleDelivery = (d: DeliveryMethod) => {
    setDeliveryOptions((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    )
  }

  const handleSubmit = () => {
    if (!name || !price || !wallet || !kycFullName || !kycIdNumber) return
    // Submit to admin queue (existing flow)
    submitListing({
      name, description, price: parseFloat(price),
      category, imageUrl, imageBase64, merchantWallet: wallet,
      kycStatus: 'submitted', kycFullName, kycIdType, kycIdNumber,
      status: 'pending',
    })

    setSubmitted(true)
    toast.success('Listing submitted for review')
  }

  const previewSrc = imageBase64 || imageUrl

  const STEPS: Step[] = ['details', 'condition', 'pricing', 'kyc', 'preview']
  const stepIdx = STEPS.indexOf(step)

  if (submitted) {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Check size={24} color="#FFF" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Listing submitted
        </h2>
        <p style={{ fontSize: 14, color: '#5C5C6B', lineHeight: 1.7, marginBottom: 20 }}>
          <strong style={{ color: '#0D0D0D' }}>{name}</strong> is pending admin review.
          Once approved it will appear in the NAN marketplace.
          Payments will go to your wallet on Arc Testnet.
        </p>
        <Button fullWidth onClick={onBack}>Back to shop</Button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={step === 'details' ? onBack : () => setStep(STEPS[stepIdx - 1])}
          style={{ width: 36, height: 36, borderRadius: 9, background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ArrowLeft size={16} color="#0D0D0D" />
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em' }}>
            {step === 'details' ? 'List a product' : step === 'condition' ? 'Condition & photos' : step === 'pricing' ? 'Pricing & delivery' : step === 'kyc' ? 'Verify your identity' : 'Preview listing'}
          </h1>
          <p style={{ fontSize: 12, color: '#9898A6', marginTop: 1 }}>Step {stepIdx + 1} of {STEPS.length}</p>
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stepIdx ? '#0D0D0D' : '#EFEFEF', transition: 'background 0.2s' }} />
        ))}
      </div>

      {/* Step: Details */}
      {step === 'details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FieldLabel label="Product name">
            <input style={inputStyle} placeholder="e.g. iPhone 15 Pro 256GB" value={name} onChange={(e) => setName(e.target.value)} />
          </FieldLabel>

          <FieldLabel label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {SHOP_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </FieldLabel>

          <FieldLabel label="Description">
            <textarea
              rows={3}
              placeholder="Describe your product — specs, what's included, any flaws..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, resize: 'none', height: 'auto', padding: '10px 14px' }}
            />
          </FieldLabel>

          <FieldLabel label="Your location (optional)">
            <input style={inputStyle} placeholder="e.g. Lagos, Nigeria" value={location} onChange={(e) => setLocation(e.target.value)} />
          </FieldLabel>

          <Button fullWidth onClick={() => { if (name) setStep('condition') }} disabled={!name}>
            Next: Condition & photos
          </Button>
        </div>
      )}

      {/* Step: Condition */}
      {step === 'condition' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Image upload */}
          <FieldLabel label="Product photos">
            <label style={{ display: 'block', border: '2px dashed rgba(0,0,0,0.12)', borderRadius: 12, padding: 16, textAlign: 'center', cursor: 'pointer', background: '#FAFAFA', minHeight: 120 }}>
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              {previewSrc ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={previewSrc} alt="Preview" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, objectFit: 'cover' }} />
                  <button
                    onClick={(e) => { e.preventDefault(); setImageBase64(''); setImageUrl('') }}
                    style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: '#0D0D0D', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <X size={11} color="#FFF" />
                  </button>
                </div>
              ) : (
                <div>
                  <Camera size={24} color="#9898A6" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 13, color: '#5C5C6B', fontFamily: FONT }}>Tap to upload a photo</div>
                </div>
              )}
            </label>
            <input type="text" placeholder="Or paste image URL: https://..." value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImageBase64('') }} style={{ ...inputStyle, marginTop: 8 }} />
          </FieldLabel>

          {/* Condition */}
          <FieldLabel label="Condition">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CONDITIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCondition(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    border: `1.5px solid ${condition === c.id ? '#0D0D0D' : 'rgba(0,0,0,0.09)'}`,
                    background: condition === c.id ? '#0D0D0D' : '#FFF',
                    cursor: 'pointer', transition: 'all 0.15s',
                    textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${condition === c.id ? '#FFF' : '#BDBDBD'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {condition === c.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFF' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: condition === c.id ? '#FFF' : '#0D0D0D', fontFamily: FONT }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: condition === c.id ? 'rgba(255,255,255,0.65)' : '#9898A6' }}>{c.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </FieldLabel>

          <Button fullWidth onClick={() => setStep('pricing')}>Next: Pricing</Button>
        </div>
      )}

      {/* Step: Pricing */}
      {step === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FieldLabel label="Price">
            <div style={{ position: 'relative' }}>
              <input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={price} onChange={(e) => setPrice(e.target.value)}
                style={{ ...inputStyle, paddingRight: 60, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
              />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: '#9898A6' }}>USDC</span>
            </div>
          </FieldLabel>

          <FieldLabel label="Quantity">
            <input type="number" min="1" step="1" placeholder="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
          </FieldLabel>

          <FieldLabel label="Delivery options">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DELIVERY_OPTS.map((d) => (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 9, border: `1px solid ${deliveryOptions.includes(d.id) ? '#0D0D0D' : 'rgba(0,0,0,0.08)'}`, background: deliveryOptions.includes(d.id) ? '#0D0D0D' : '#FFF', transition: 'all 0.12s' }}>
                  <input type="checkbox" checked={deliveryOptions.includes(d.id)} onChange={() => toggleDelivery(d.id)} style={{ display: 'none' }} />
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${deliveryOptions.includes(d.id) ? '#FFF' : '#BDBDBD'}`, background: deliveryOptions.includes(d.id) ? '#FFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {deliveryOptions.includes(d.id) && <Check size={10} color="#0D0D0D" />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: deliveryOptions.includes(d.id) ? '#FFF' : '#0D0D0D', fontFamily: FONT }}>{d.label}</span>
                </label>
              ))}
            </div>
          </FieldLabel>

          <FieldLabel label="Receive payment to wallet">
            <input style={inputStyle} placeholder="0x..." value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </FieldLabel>

          <div style={{ padding: '10px 13px', background: '#F7F7F8', borderRadius: 10, fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
            Buyers pay USDC directly onchain to your wallet. A 1% platform fee is deducted from the escrow amount.
          </div>

          <Button fullWidth onClick={() => { if (price && wallet) setStep('kyc') }} disabled={!price || !wallet}>
            Next: Verify identity
          </Button>
        </div>
      )}

      {/* Step: KYC */}
      {step === 'kyc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '12px 14px', background: '#F7F7F8', borderRadius: 10, fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
            All sellers are verified to protect buyers. Your information is stored securely and reviewed by our team.
          </div>

          <FieldLabel label="Full legal name">
            <input style={inputStyle} placeholder="e.g. Jane Smith" value={kycFullName} onChange={(e) => setKycFullName(e.target.value)} />
          </FieldLabel>

          <FieldLabel label="ID type">
            <select value={kycIdType} onChange={(e) => setKycIdType(e.target.value)} style={inputStyle}>
              <option value="passport">Passport</option>
              <option value="national_id">National ID</option>
              <option value="drivers_license">Driver's License</option>
            </select>
          </FieldLabel>

          <FieldLabel label="ID number">
            <input style={inputStyle} placeholder="e.g. AB123456" value={kycIdNumber} onChange={(e) => setKycIdNumber(e.target.value)} />
          </FieldLabel>

          <Button fullWidth onClick={() => { if (kycFullName && kycIdNumber) setStep('preview') }} disabled={!kycFullName || !kycIdNumber}>
            Preview listing
          </Button>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9898A6', fontFamily: FONT }}>Preview</div>

          {/* Preview card */}
          <div style={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 14, overflow: 'hidden', background: '#FFF' }}>
            <div style={{ aspectRatio: '4/3', background: '#F7F7F8', overflow: 'hidden' }}>
              {previewSrc
                ? <img src={previewSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={28} color="#BDBDBD" />
                  </div>
              }
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#9898A6', marginBottom: 4, fontFamily: FONT }}>{category}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em', marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 13, color: '#5C5C6B', marginBottom: 8 }}>{description}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0D0D0D', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>
                  {price ? formatUSDC(parseFloat(price)) : '—'} <span style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B' }}>USDC</span>
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0D0D0D', background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, padding: '2px 8px' }}>
                  {condition}
                </span>
              </div>
              {location && <div style={{ fontSize: 12, color: '#9898A6', marginTop: 6 }}>{location}</div>}
            </div>
          </div>

          <div style={{ padding: '10px 13px', background: '#F7F7F8', borderRadius: 10, fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
            Your listing will be reviewed by the NAN team before going live. This typically takes a few hours.
          </div>

          <Button fullWidth size="lg" onClick={handleSubmit}>
            Publish listing
          </Button>
        </div>
      )}
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B', fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 14px',
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 11, background: '#F7F7F8',
  fontSize: 14, color: '#0D0D0D',
  fontFamily: "'Inter', sans-serif",
  outline: 'none', boxSizing: 'border-box',
  appearance: 'none',
}
