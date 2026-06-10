interface TopBarProps {
  title:    string
  subtitle?: string
  children?: React.ReactNode
}

export default function TopBar({ title, subtitle, children }: TopBarProps) {
  return (
    <div className="h-[60px] flex items-center px-[26px] gap-3 flex-shrink-0"
      style={{ background: '#fff', borderBottom: '1px solid #EDE0D4' }}>
      <div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#1C0F05' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: '#A89080' }}>{subtitle}</div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {children}
      </div>
    </div>
  )
}
