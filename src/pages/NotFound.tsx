import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center" role="status" aria-label="Page not found">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page not found</p>
        <p className="mb-6 text-sm text-muted-foreground">
          The page <code className="rounded bg-background px-1.5 py-0.5">{location.pathname}</code> doesn't exist
          or may have moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/" className="text-primary underline underline-offset-4 hover:text-primary/90">
            Return to home
          </Link>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <Link to="/shop" className="text-primary underline underline-offset-4 hover:text-primary/90">
            Browse stores
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
