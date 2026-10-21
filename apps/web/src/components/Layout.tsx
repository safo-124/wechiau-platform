import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/farmers', label: 'Farmers' },
  { to: '/health', label: 'Health and vets' },
  { to: '/money', label: 'Money' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
] as const;

/** Sidebar and page area from the dashboard designs (web-dashboard/*.dc.html). */
export function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-name">Wechiau Poultry</span>
          <span className="brand-sub">Dashboard · {user.name}</span>
        </div>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item} className="nav-link">
            {item.label}
          </NavLink>
        ))}
        <button type="button" className="nav-link sign-out" onClick={signOut}>
          Sign out
        </button>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
