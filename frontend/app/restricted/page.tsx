export default function RestrictedPage() {
  return (
    <main className="min-h-screen bg-pulse-dark flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🚫</div>
        <h1 className="font-display text-4xl tracking-widest text-white mb-4">
          ACCESS RESTRICTED
        </h1>
        <p className="text-pulse-muted font-mono text-sm leading-relaxed">
          Pulse Protocol is not available in your jurisdiction.<br />
          This platform operates under a licensed framework and<br />
          complies with all applicable regulations.
        </p>
      </div>
    </main>
  )
}
