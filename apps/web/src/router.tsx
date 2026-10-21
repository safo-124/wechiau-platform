import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { ConversationPage } from './pages/ConversationPage';
import { FarmersPage } from './pages/FarmersPage';
import { HealthPage } from './pages/HealthPage';
import { MoneyPage } from './pages/MoneyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: OverviewPage },
      { path: 'farmers', Component: FarmersPage },
      { path: 'health', Component: HealthPage },
      { path: 'health/messages/:farmerId', Component: ConversationPage },
      { path: 'money', Component: MoneyPage },
      { path: 'reports', Component: ReportsPage },
      { path: 'settings', Component: SettingsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
