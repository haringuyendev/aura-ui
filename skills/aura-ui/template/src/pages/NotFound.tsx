import { Link, useLocation } from "react-router-dom"

export default function NotFound() {
  const location = useLocation()
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-semibold text-foreground">404</h1>
        <p className="mb-4 text-muted-foreground">
          Không tìm thấy trang <code>{location.pathname}</code>
        </p>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Về trang chủ
        </Link>
      </div>
    </main>
  )
}
