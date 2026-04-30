import { Navigate, Route, Routes } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import Layout from './components/Layout';
import Dashboard from './routes/Dashboard';
import Transactions from './routes/Transactions';
import Categories from './routes/Categories';
import Budget from './routes/Budget';
import Report from './routes/Report';
import Settings from './routes/Settings';

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/report" element={<Report />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthGate>
  );
}
