const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function HomePage() {
  return (
    <main className="card">
      <h1>X Account Cleaner</h1>
      <p className="muted">
        X hesabını OAuth ile bağla, postlarını tara, silinecekleri önizle ve
        rate-limit-aware güvenli bir silme işi başlat.
      </p>
      <div className="row">
        <a className="btn primary" href={`${apiBase}/auth/x/start`}>
          X ile Bağlan (OAuth)
        </a>
        <a className="btn" href="/dashboard">
          Dashboard
        </a>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Not: Bu scaffold mock-first çalışır. Local’de gerçek X client için env
        ayarları gerekir.
      </p>
    </main>
  );
}

